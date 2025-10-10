# connections/views.py

from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json
import csv
import re 
from django.db.models import F, Sum, Count
from functools import reduce
import operator
from .consumers import RevitConsumer, FrontendConsumer, serialize_specific_elements


from .models import (
    Project,
    RawElement,
    QuantityClassificationTag,
    ClassificationRule,
    QuantityMember,
    CostItem,
    CostCode,
    PropertyMappingRule,
    MemberMark, 
    CostCodeRule, 
    MemberMarkAssignmentRule, 
    CostCodeAssignmentRule,
    SpaceClassification,
    SpaceClassificationRule,
    SpaceAssignmentRule, # <--- 이 부분을 추가해주세요.

)
# --- Project & Revit Data Views ---

def revit_control_panel(request):
    projects = Project.objects.all().order_by('-created_at')
    return render(request, 'revit_control.html', {'projects': projects})

def create_project(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        project_name = data.get('name')
        if project_name:
            project = Project.objects.create(name=project_name)
            return JsonResponse({'status': 'success', 'project_id': str(project.id), 'project_name': project.name})
    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)

def trigger_revit_data_fetch(request, project_id):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        RevitConsumer.revit_group_name,
        {'type': 'send.command', 'command_data': {'command': 'fetch_all_elements', 'project_id': str(project_id)}}
    )
    return JsonResponse({'status': 'success', 'message': f'Fetch command sent for project {project_id}.'})

# --- Tag Import/Export Views ---

def export_tags(request, project_id):
    project = Project.objects.get(id=project_id)
    tags = project.classification_tags.all().order_by('name')
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_tags.qctags"'
    writer = csv.writer(response)
    writer.writerow(['name', 'description'])
    for tag in tags:
        writer.writerow([tag.name, tag.description])
    return response

def import_tags(request, project_id):
    if request.method == 'POST' and request.FILES.get('tag_file'):
        project = Project.objects.get(id=project_id)
        tag_file = request.FILES['tag_file']
        try:
            # [수정] 삭제 전, 영향을 받을 모든 RawElement의 ID를 미리 가져옵니다.
            affected_element_ids = list(RawElement.objects.filter(
                project=project, 
                classification_tags__isnull=False
            ).values_list('id', flat=True))

            # 기존 태그를 모두 삭제합니다.
            project.classification_tags.all().delete()
            
            # 파일에서 새 태그를 읽어 생성합니다.
            decoded_file = tag_file.read().decode('utf-8').splitlines()
            reader = csv.reader(decoded_file)
            next(reader, None) # 헤더 건너뛰기
            for row in reader:
                if row:
                    name = row[0]
                    description = row[1] if len(row) > 1 else ""
                    QuantityClassificationTag.objects.create(project=project, name=name, description=description)
            
            # [수정] 변경된 태그 목록과 영향을 받은 객체 정보를 프론트엔드로 전송합니다.
            channel_layer = get_channel_layer()

            # 1. 업데이트된 태그 목록 전송
            tags = [{'id': str(tag.id), 'name': tag.name} for tag in project.classification_tags.all()]
            async_to_sync(channel_layer.group_send)(
                FrontendConsumer.frontend_group_name,
                {'type': 'broadcast_tags', 'tags': tags}
            )

            # 2. 영향을 받은 객체가 있었다면, 최신 상태를 전송
            if affected_element_ids:
                # async 함수를 sync 컨텍스트에서 호출하기 위해 async_to_sync 사용
                updated_elements_data = async_to_sync(serialize_specific_elements)(affected_element_ids)
                if updated_elements_data:
                    async_to_sync(channel_layer.group_send)(
                        FrontendConsumer.frontend_group_name,
                        {'type': 'broadcast_elements', 'elements': updated_elements_data}
                    )

            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)





# --- Classification Ruleset API ---

@require_http_methods(["GET", "POST", "DELETE"])
def classification_rules_api(request, project_id, rule_id=None):
    if request.method == 'GET':
        rules = ClassificationRule.objects.filter(project_id=project_id).select_related('target_tag')
        rules_data = [{
            'id': rule.id,
            'target_tag_id': str(rule.target_tag.id),
            'target_tag_name': rule.target_tag.name,
            'conditions': rule.conditions,
            'priority': rule.priority,
            'description': rule.description
        } for rule in rules]
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            target_tag = QuantityClassificationTag.objects.get(id=data.get('target_tag_id'), project=project)
            rule_id_from_data = data.get('id')
            if rule_id_from_data:
                rule = ClassificationRule.objects.get(id=rule_id_from_data, project=project)
            else:
                rule = ClassificationRule(project=project)
            rule.target_tag = target_tag
            rule.conditions = data.get('conditions', [])
            rule.priority = data.get('priority', 0)
            rule.description = data.get('description', '')
            rule.save()
            return JsonResponse({'status': 'success', 'message': '규칙이 저장되었습니다.', 'rule_id': rule.id})
        except (Project.DoesNotExist, QuantityClassificationTag.DoesNotExist, ClassificationRule.DoesNotExist) as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        if not rule_id:
            return JsonResponse({'status': 'error', 'message': 'Rule ID가 필요합니다.'}, status=400)
        try:
            rule = ClassificationRule.objects.get(id=rule_id, project_id=project_id)
            rule.delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except ClassificationRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)



# ▼▼▼ [추가] 이 함수를 아래에 추가해주세요 ▼▼▼
@require_http_methods(["GET", "POST", "DELETE"])
def property_mapping_rules_api(request, project_id, rule_id=None):
    # --- GET: 룰셋 목록 조회 ---
    if request.method == 'GET':
        rules = PropertyMappingRule.objects.filter(project_id=project_id).select_related('target_tag')
        rules_data = [{
            'id': str(rule.id),
            'name': rule.name,
            'description': rule.description,
            'target_tag_id': str(rule.target_tag.id),
            'target_tag_name': rule.target_tag.name,
            'conditions': rule.conditions,
            'mapping_script': rule.mapping_script,
            'priority': rule.priority,
        } for rule in rules]
        return JsonResponse(rules_data, safe=False)

    # --- POST: 룰셋 생성 또는 수정 ---
    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            target_tag = QuantityClassificationTag.objects.get(id=data.get('target_tag_id'), project=project)
            
            rule_id_from_data = data.get('id')
            if rule_id_from_data: # 수정
                rule = PropertyMappingRule.objects.get(id=rule_id_from_data, project=project)
            else: # 생성
                rule = PropertyMappingRule(project=project)

            rule.name = data.get('name', '이름 없는 규칙')
            rule.description = data.get('description', '')
            rule.target_tag = target_tag
            rule.conditions = data.get('conditions', [])
            rule.mapping_script = data.get('mapping_script', {})
            rule.priority = data.get('priority', 0)
            rule.save()
            
            return JsonResponse({'status': 'success', 'message': '속성 맵핑 규칙이 저장되었습니다.', 'rule_id': str(rule.id)})
        except (Project.DoesNotExist, QuantityClassificationTag.DoesNotExist, PropertyMappingRule.DoesNotExist) as e:
            return JsonResponse({'status': 'error', 'message': f'데이터를 찾을 수 없습니다: {str(e)}'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'저장 중 오류 발생: {str(e)}'}, status=400)

    # --- DELETE: 룰셋 삭제 ---
    elif request.method == 'DELETE':
        if not rule_id:
            return JsonResponse({'status': 'error', 'message': 'Rule ID가 필요합니다.'}, status=400)
        try:
            rule = PropertyMappingRule.objects.get(id=rule_id, project_id=project_id)
            rule.delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except PropertyMappingRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)
# ▲▲▲ [추가] 여기까지 입니다 ▲▲▲


def get_value_from_element(raw_data, parameter_name):
    """
    (최종 수정 버전) 점(.)이 포함된 키를 직접 탐색하고, 실패 시 중첩된 구조로 다시 탐색합니다.
    'Parameters', 'TypeParameters' 등 다양한 위치를 모두 확인합니다.
    """
    if not raw_data or not parameter_name:
        return None

    # 검색할 위치 목록 (우선순위 순)
    search_locations = [
        raw_data,
        raw_data.get('Parameters', {}),
        raw_data.get('TypeParameters', {})
    ]

    # 1. 먼저, parameter_name 전체를 하나의 키로 간주하고 직접 찾아봅니다.
    #    (예: "Qto_SlabBaseQuantities.NetArea" 라는 키가 있는지 확인)
    for location in search_locations:
        if isinstance(location, dict) and parameter_name in location:
            return location[parameter_name]

    # 2. 직접 찾지 못한 경우에만, 점(.)을 기준으로 중첩 탐색을 시도합니다.
    #    (예: "TypeParameters.SomeSet.SomeProperty")
    if '.' in parameter_name:
        parts = parameter_name.split('.')
        current_obj = raw_data
        for part in parts:
            if isinstance(current_obj, dict):
                current_obj = current_obj.get(part)
            else:
                # 중간 경로 탐색에 실패하면 None을 반환하기 전에 for 루프를 중단합니다.
                current_obj = None
                break
        
        # 순회가 성공적으로 끝났다면 current_obj는 찾고자 하는 값이 됩니다.
        if current_obj is not None:
            return current_obj

    # 모든 방법으로도 찾지 못한 경우
    return None

def is_numeric(value):
    if value is None: return False
    try: float(value); return True
    except (ValueError, TypeError): return False
# 기존의 evaluate_conditions 함수를 찾아서 아래 코드로 교체해주세요.

def evaluate_conditions(data_dict, conditions):
    """
    주어진 데이터 딕셔너리가 모든 조건을 만족하는지 평가합니다.
    - data_dict: 평가의 기준이 될 키-값 형태의 딕셔너리
    - conditions: 평가할 조건들의 리스트 또는 딕셔너리
    """
    if not conditions: return True
    if isinstance(conditions, list):
        # 조건 리스트의 모든 항목을 만족해야 True (AND)
        return all(evaluate_conditions(data_dict, cond) for cond in conditions)
    
    if isinstance(conditions, dict):
        # OR 조건 처리
        if 'OR' in conditions and isinstance(conditions['OR'], list):
            return any(evaluate_conditions(data_dict, cond) for cond in conditions['OR'])
        
        # 개별 조건 처리
        p = conditions.get('parameter')
        o = conditions.get('operator')
        v = conditions.get('value')
        
        if not all([p, o, v is not None]): return False

        # [핵심 수정] get_value_from_element 대신 단순 딕셔너리 조회로 변경
        actual_value = data_dict.get(p)
        actual_v_str = str(actual_value or "")

        if o == 'equals': return actual_v_str == str(v)
        if o == 'not_equals': return actual_v_str != str(v)
        if o == 'contains': return str(v) in actual_v_str
        if o == 'not_contains': return str(v) not in actual_v_str
        if o == 'starts_with': return actual_v_str.startswith(str(v))
        if o == 'ends_with': return actual_v_str.endswith(str(v))
        
        # 숫자 비교 연산자
        if o in ['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal']:
            if is_numeric(actual_value) and is_numeric(v):
                actual_num, v_num = float(actual_value), float(v)
                if o == 'greater_than': return actual_num > v_num
                if o == 'less_than': return actual_num < v_num
                if o == 'greater_or_equal': return actual_num >= v_num
                if o == 'less_or_equal': return actual_num <= v_num
        
        # 존재 여부 확인
        if o == 'exists': return actual_value is not None
        if o == 'not_exists': return actual_value is None

    return False
@require_http_methods(["POST"])
def apply_classification_rules_view(request, project_id):
    try:
        project = Project.objects.get(id=project_id)
        rules = ClassificationRule.objects.filter(project=project).order_by('priority').select_related('target_tag')
        elements = RawElement.objects.filter(project=project).prefetch_related('classification_tags')

        if not rules.exists():
            return JsonResponse({'status': 'info', 'message': '적용할 규칙이 없습니다. 먼저 룰셋을 정의해주세요.'})

        project_tags = {tag.name: tag for tag in QuantityClassificationTag.objects.filter(project=project)}
        updated_count = 0

        for element in elements:
            current_tag_names = {tag.name for tag in element.classification_tags.all()}
            tags_to_add = {rule.target_tag.name for rule in rules if evaluate_conditions(element.raw_data, rule.conditions)}
            
            if not tags_to_add.issubset(current_tag_names):
                final_names = current_tag_names.union(tags_to_add)
                final_objects = [project_tags[name] for name in final_names if name in project_tags]
                element.classification_tags.set(final_objects)
                updated_count += 1

        message = f'룰셋을 적용하여 총 {updated_count}개 객체의 분류를 업데이트했습니다.' if updated_count > 0 else '모든 객체가 이미 룰셋의 조건과 일치하여, 변경된 사항이 없습니다.'
        return JsonResponse({'status': 'success', 'message': message})
    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': f'오류 발생: {str(e)}'}, status=500)
# aibim_quantity_takeoff_web/connections/views.py


# ▼▼▼ [추가] 이 함수를 아래에 추가해주세요 ▼▼▼
@require_http_methods(["GET", "POST", "DELETE", "PUT"])
def cost_codes_api(request, project_id, code_id=None):
    # --- GET: 공사코드 목록 조회 ---
    if request.method == 'GET':
        codes = CostCode.objects.filter(project_id=project_id)
        codes_data = [{
            'id': str(code.id),
            'code': code.code,
            'name': code.name,
            'spec': code.spec,
            'unit': code.unit,
            'category': code.category,
            'description': code.description,
        } for code in codes]
        return JsonResponse(codes_data, safe=False)

    # --- POST: 새 공사코드 생성 ---
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            project = Project.objects.get(id=project_id)
            
            # 필수 필드 확인
            if not data.get('code') or not data.get('name'):
                return JsonResponse({'status': 'error', 'message': '코드와 품명은 필수 항목입니다.'}, status=400)

            new_code = CostCode.objects.create(
                project=project,
                code=data.get('code'),
                name=data.get('name'),
                spec=data.get('spec', ''),
                unit=data.get('unit', ''),
                category=data.get('category', ''),
                description=data.get('description', '')
            )
            return JsonResponse({'status': 'success', 'message': '새 공사코드가 생성되었습니다.', 'code_id': str(new_code.id)})
        except Project.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'저장 중 오류 발생: {str(e)}'}, status=400)

    # --- PUT: 공사코드 수정 ---
    elif request.method == 'PUT':
        if not code_id:
            return JsonResponse({'status': 'error', 'message': '공사코드 ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            cost_code = CostCode.objects.get(id=code_id, project_id=project_id)

            cost_code.code = data.get('code', cost_code.code)
            cost_code.name = data.get('name', cost_code.name)
            cost_code.spec = data.get('spec', cost_code.spec)
            cost_code.unit = data.get('unit', cost_code.unit)
            cost_code.category = data.get('category', cost_code.category)
            cost_code.description = data.get('description', cost_code.description)
            cost_code.save()

            return JsonResponse({'status': 'success', 'message': '공사코드가 수정되었습니다.'})
        except CostCode.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 공사코드를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


    # --- DELETE: 공사코드 삭제 ---
    elif request.method == 'DELETE':
        if not code_id:
            return JsonResponse({'status': 'error', 'message': '공사코드 ID가 필요합니다.'}, status=400)
        try:
            cost_code = CostCode.objects.get(id=code_id, project_id=project_id)
            cost_code.delete()
            return JsonResponse({'status': 'success', 'message': '공사코드가 삭제되었습니다.'})
        except CostCode.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '공사코드를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            # PROTECT 옵션 등으로 인해 삭제가 안될 경우를 대비
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)
# ▲▲▲ [추가] 여기까지 입니다 ▲▲▲



# ▼▼▼ [추가] cost_codes_api 함수 아래에 이 함수 블록 전체를 추가해주세요. ▼▼▼
@require_http_methods(["GET", "POST", "PUT", "DELETE"])
def member_marks_api(request, project_id, mark_id=None):
    # --- GET: 일람부호 목록 조회 ---
    if request.method == 'GET':
        marks = MemberMark.objects.filter(project_id=project_id)
        marks_data = [{
            'id': str(mark.id),
            'mark': mark.mark,
            'description': mark.description,
            'properties': mark.properties,
        } for mark in marks]
        return JsonResponse(marks_data, safe=False)

    # --- POST: 새 일람부호 생성 ---
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            project = Project.objects.get(id=project_id)
            if not data.get('mark'):
                return JsonResponse({'status': 'error', 'message': '일람부호(mark)는 필수 항목입니다.'}, status=400)

            new_mark = MemberMark.objects.create(
                project=project,
                mark=data.get('mark'),
                description=data.get('description', ''),
                properties=data.get('properties', {})
            )
            return JsonResponse({'status': 'success', 'message': '새 일람부호가 생성되었습니다.', 'mark_id': str(new_mark.id)})
        except Project.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'저장 중 오류 발생: {str(e)}'}, status=400)

    # --- PUT: 일람부호 수정 ---
    elif request.method == 'PUT':
        if not mark_id: return JsonResponse({'status': 'error', 'message': '일람부호 ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            mark = MemberMark.objects.get(id=mark_id, project_id=project_id)

            mark.mark = data.get('mark', mark.mark)
            mark.description = data.get('description', mark.description)
            mark.properties = data.get('properties', mark.properties)
            mark.save()
            return JsonResponse({'status': 'success', 'message': '일람부호가 수정되었습니다.'})
        except MemberMark.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 일람부호를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    # --- DELETE: 일람부호 삭제 ---
    elif request.method == 'DELETE':
        if not mark_id: return JsonResponse({'status': 'error', 'message': '일람부호 ID가 필요합니다.'}, status=400)
        try:
            mark = MemberMark.objects.get(id=mark_id, project_id=project_id)
            mark.delete()
            return JsonResponse({'status': 'success', 'message': '일람부호가 삭제되었습니다.'})
        except MemberMark.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '일람부호를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)
# ▲▲▲ [추가] 여기까지 입니다. ▲▲▲



# ▼▼▼ [수정] 이 함수를 아래 코드로 교체해주세요 ▼▼▼
def evaluate_expression(expression, raw_data):
    """
    '{Volume} * 1.05' 또는 '{{Volume}} * 2'와 같은 문자열 표현식을 실제 값으로 계산합니다.
    - {parameter}: 파라미터 값을 그대로 사용합니다. (예: "30.5 m³")
    - {{parameter}}: 파라미터 값에서 숫자만 추출하여 사용합니다. (예: "30.5 m³" -> 30.5)
    """
    if not isinstance(expression, str):
        return expression

    temp_expression = expression
    
    # --- 1단계: 숫자만 추출하는 {{parameter}} 처리 ---
    # 중복된 플레이스홀더가 있어도 한 번만 처리하도록 set()을 사용합니다.
    numeric_placeholders = re.findall(r'\{\{([^}]+)\}\}', temp_expression)
    for placeholder in set(numeric_placeholders):
        value = get_value_from_element(raw_data, placeholder)
        
        if value is not None:
            # 값의 시작 부분에서 숫자(소수점, 음수 포함)만 추출합니다.
            match = re.match(r'^\s*(-?\d+(\.\d+)?)\s*', str(value))
            if match:
                numeric_value = match.group(1)
                # {{...}} 형태의 모든 플레이스홀더를 추출된 숫자 값으로 바꿉니다.
                temp_expression = temp_expression.replace(f'{{{{{placeholder}}}}}', str(numeric_value))
            else:
                # 숫자 추출에 실패하면 계산 오류를 방지하기 위해 0으로 처리합니다.
                temp_expression = temp_expression.replace(f'{{{{{placeholder}}}}}', '0')
        else:
            return f"Error: Parameter '{placeholder}' not found for numeric extraction."

    # --- 2단계: 일반 {parameter} 처리 ---
    # {{...}}가 처리된 후의 문자열에서 {...}를 찾습니다.
    placeholders = re.findall(r'\{([^}]+)\}', temp_expression)
    for placeholder in set(placeholders):
        value = get_value_from_element(raw_data, placeholder)
        if value is not None:
            # 값이 숫자인지 확인하고, 문자열이면 따옴표로 감싸줍니다.
            replacement = str(value) if is_numeric(value) else f'"{str(value)}"'
            temp_expression = temp_expression.replace(f'{{{placeholder}}}', replacement)
        else:
            return f"Error: Parameter '{placeholder}' not found."

    # --- 3단계: 최종 문자열 계산 ---
    if not temp_expression.strip():
        return ""
        
    try:
        # eval의 위험성을 줄이기 위해 사용 가능한 내장 함수를 제한합니다.
        safe_dict = {'__builtins__': {'abs': abs, 'round': round, 'max': max, 'min': min, 'len': len}}
        return eval(temp_expression, safe_dict)
    except Exception as e:
        # 디버깅을 위해 실패한 표현식과 에러 메시지를 함께 반환합니다.
        return f"Error: Failed to evaluate '{expression}' -> '{temp_expression}' ({str(e)})"
# ▲▲▲ [수정] 여기까지가 교체될 코드의 끝입니다. ▲▲▲
def calculate_properties_from_rule(raw_data, mapping_script):
    """
    매핑 스크립트(JSON)의 각 항목을 evaluate_expression을 사용하여 계산합니다.
    """
    calculated_properties = {}
    if not isinstance(mapping_script, dict):
        return {"Error": "Mapping script is not a valid JSON object."}
        
    for key, expression in mapping_script.items():
        calculated_properties[key] = evaluate_expression(expression, raw_data)
    
    return calculated_properties


@require_http_methods(["GET", "POST", "DELETE", "PUT"])
def quantity_members_api(request, project_id, member_id=None):
    # --- GET: 부재 목록 조회 ---
    if request.method == 'GET':
        # [수정] prefetch_related에 'space_classifications'를 추가합니다.
        members = QuantityMember.objects.filter(project_id=project_id).select_related('classification_tag', 'member_mark').prefetch_related('cost_codes', 'space_classifications')
        data = []
        for m in members:
            item = {
                'id': str(m.id), 
                'name': m.name, 
                'classification_tag_id': str(m.classification_tag.id) if m.classification_tag else '', 
                'classification_tag_name': m.classification_tag.name if m.classification_tag else '미지정', 
                'properties': m.properties,
                'mapping_expression': m.mapping_expression,
                'member_mark_expression': m.member_mark_expression,
                'cost_code_expressions': m.cost_code_expressions,
                'raw_element_id': str(m.raw_element_id) if m.raw_element_id else None,
                'cost_code_ids': [str(cc.id) for cc in m.cost_codes.all()],
                'member_mark_id': str(m.member_mark.id) if m.member_mark else None,
                # ▼▼▼ [추가] 할당된 공간분류 정보를 추가합니다. ▼▼▼
                'space_classification_ids': [str(sc.id) for sc in m.space_classifications.all()],
            }
            data.append(item)
        return JsonResponse(data, safe=False)

    # --- POST: 부재 수동 생성 ---
    elif request.method == 'POST':
        try:
            project = Project.objects.get(id=project_id)
            new_member = QuantityMember.objects.create(
                project=project,
                name="새 수량산출부재 (수동)",
            )
            return JsonResponse({'status': 'success', 'message': '새 수량산출부재가 수동으로 생성되었습니다.', 'member_id': str(new_member.id)})
        except Project.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'생성 중 오류 발생: {str(e)}'}, status=400)


    # --- DELETE: 부재 삭제 ---
    elif request.method == 'DELETE':
        if not member_id:
            return JsonResponse({'status': 'error', 'message': 'Member ID가 필요합니다.'}, status=400)
        try:
            member = QuantityMember.objects.get(id=member_id, project_id=project_id)
            member.delete()
            return JsonResponse({'status': 'success', 'message': '부재가 삭제되었습니다.'})
        except QuantityMember.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 부재를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)
   

    # --- PUT: 부재 수정 ---
    elif request.method == 'PUT':
        if not member_id:
            return JsonResponse({'status': 'error', 'message': 'Member ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            member = QuantityMember.objects.select_related('raw_element').get(id=member_id, project_id=project_id)

            # 1. 이름, 분류, 표현식 등 다른 속성들을 먼저 업데이트합니다.
            if 'name' in data: member.name = data['name']
            if 'classification_tag_id' in data:
                tag_id = data['classification_tag_id']
                member.classification_tag = QuantityClassificationTag.objects.get(id=tag_id, project_id=project_id) if tag_id else None
            if 'mapping_expression' in data:
                member.mapping_expression = data['mapping_expression']
            if 'member_mark_expression' in data:
                member.member_mark_expression = data['member_mark_expression']
            if 'cost_code_expressions' in data:
                member.cost_code_expressions = data['cost_code_expressions']

            # 2. 속성(properties)을 계산하고 병합합니다.
            #    - 먼저 프론트엔드에서 보낸 수동 속성을 기본값으로 설정합니다.
            final_properties = data.get('properties', member.properties or {})

            #    - BIM 원본 객체가 있으면 그 데이터를, 없으면 빈 dict를 데이터 소스로 사용합니다.
            data_source = member.raw_element.raw_data if member.raw_element else {}
            
            #    - 업데이트된 맵핑식이 있다면, 이를 기반으로 속성을 계산합니다.
            if member.mapping_expression:
                calculated_properties = calculate_properties_from_rule(data_source, member.mapping_expression)
                #    - 계산된 결과를 수동 속성에 덮어씁니다. (맵핑식 우선 적용)
                final_properties.update(calculated_properties)

            #    - 최종적으로 병합된 속성으로 업데이트합니다.
            member.properties = final_properties

            # 3. M2M 필드 (공사코드, 일람부호)를 업데이트합니다.
            if 'cost_code_ids' in data:
                cost_codes = CostCode.objects.filter(id__in=data['cost_code_ids'], project_id=project_id)
                member.cost_codes.set(cost_codes)
            
            if 'member_mark_id' in data:
                mark_id = data['member_mark_id']
                member.member_mark = MemberMark.objects.get(id=mark_id, project_id=project_id) if mark_id else None
            
            # 4. 모든 변경사항을 데이터베이스에 저장합니다.
            member.save()

            return JsonResponse({
                'status': 'success', 
                'message': '부재 정보가 수정되었습니다.',
                'updated_member': {
                    'id': str(member.id),
                    'properties': member.properties,
                    'mapping_expression': member.mapping_expression,
                }
            })
        except QuantityMember.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 부재를 찾을 수 없습니다.'}, status=404)
        except (QuantityClassificationTag.DoesNotExist, CostCode.DoesNotExist, MemberMark.DoesNotExist):
            return JsonResponse({'status': 'error', 'message': '해당 분류, 공사코드 또는 일람부호를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)




# ▼▼▼ [수정] 이 함수를 아래의 새 코드로 완전히 교체해주세요. ▼▼▼
@require_http_methods(["POST"])
def create_quantity_members_auto_view(request, project_id):
    try:
        project = Project.objects.get(id=project_id)
        
        rules = PropertyMappingRule.objects.filter(project=project).order_by('priority').select_related('target_tag')
        elements = RawElement.objects.filter(project=project, classification_tags__isnull=False).prefetch_related('classification_tags').distinct()

        # [수정] 룰셋이 없더라도, 개별 맵핑식이 적용된 부재가 있을 수 있으므로 조건을 수정합니다.
        if not rules.exists() and not QuantityMember.objects.filter(project=project, raw_element__isnull=False).exclude(mapping_expression={}).exists():
             return JsonResponse({'status': 'info', 'message': '자동 생성을 위한 속성 맵핑 규칙이 없거나 개별 맵핑식이 적용된 부재가 없습니다.'})

        valid_member_ids = set()
        updated_count = 0
        created_count = 0

        for element in elements:
            element_tags = element.classification_tags.all()
            
            for tag in element_tags:
                member, created = QuantityMember.objects.update_or_create(
                    project=project,
                    raw_element=element,
                    classification_tag=tag,
                    defaults={'name': f"{element.raw_data.get('Name', 'Unnamed')}_{tag.name}"}
                )

                if created: created_count += 1
                else: updated_count += 1

                script_to_use = None
                
                # [핵심 로직]
                # 1. 개별 부재에 맵핑식이 있는지 먼저 확인합니다. (비어있는 dict가 아닌 경우)
                if member.mapping_expression and isinstance(member.mapping_expression, dict) and member.mapping_expression:
                    script_to_use = member.mapping_expression
                # 2. 개별 맵핑식이 없으면, 기존 로직대로 룰셋을 찾습니다.
                else:
                    for rule in rules:
                        if rule.target_tag_id == tag.id and evaluate_conditions(element.raw_data, rule.conditions):
                            script_to_use = rule.mapping_script
                            break
                
                # 적용할 스크립트가 결정되었다면 속성을 계산하고 업데이트합니다.
                if script_to_use:
                    properties = calculate_properties_from_rule(element.raw_data, script_to_use)
                    if member.properties != properties:
                        member.properties = properties
                        member.save(update_fields=['properties'])

                valid_member_ids.add(member.id)
        
        deletable_members = QuantityMember.objects.filter(project=project, raw_element__isnull=False).exclude(id__in=valid_member_ids)
        deleted_count, _ = deletable_members.delete()

        message = (f'룰셋/개별 맵핑식을 적용하여 {created_count}개의 부재를 새로 생성하고, '
                   f'{updated_count}개를 업데이트했습니다. '
                   f'유효하지 않은 부재 {deleted_count}개를 삭제했습니다.')

        return JsonResponse({'status': 'success', 'message': message})

    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return JsonResponse({'status': 'error', 'message': f'자동 생성 중 오류 발생: {str(e)}', 'details': error_details}, status=500)
# ▲▲▲ [수정] 여기까지 입니다. ▲▲▲


# ▼▼▼ [추가] 파일의 맨 아래에 이 함수를 추가해주세요. ▼▼▼
@require_http_methods(["POST"])
def manage_quantity_member_cost_codes_api(request, project_id):
    """선택된 여러 수량산출부재에 대해 공사코드를 일괄 할당/해제하는 API"""
    try:
        data = json.loads(request.body)
        member_ids = data.get('member_ids', [])
        cost_code_id = data.get('cost_code_id') # 추가할 단일 공사코드 ID
        action = data.get('action') # 'assign' 또는 'clear'

        if not all([member_ids, action]):
            return JsonResponse({'status': 'error', 'message': '필수 파라미터가 누락되었습니다.'}, status=400)

        members = QuantityMember.objects.filter(project_id=project_id, id__in=member_ids)
        
        if action == 'assign':
            if not cost_code_id:
                return JsonResponse({'status': 'error', 'message': '할당할 공사코드 ID가 필요합니다.'}, status=400)
            cost_code_to_add = CostCode.objects.get(id=cost_code_id, project_id=project_id)
            for member in members:
                member.cost_codes.add(cost_code_to_add)
            message = f'{len(member_ids)}개 부재에 공사코드 "{cost_code_to_add.name}"을(를) 추가했습니다.'

        elif action == 'clear':
            # 'clear' 액션은 모든 공사코드를 제거합니다.
            for member in members:
                member.cost_codes.clear()
            message = f'{len(member_ids)}개 부재의 모든 공사코드를 제거했습니다.'
        
        else:
            return JsonResponse({'status': 'error', 'message': '잘못된 action입니다. "assign" 또는 "clear"를 사용하세요.'}, status=400)

        return JsonResponse({'status': 'success', 'message': message})

    except CostCode.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '존재하지 않는 공사코드입니다.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_http_methods(["POST"])
def manage_quantity_member_member_marks_api(request, project_id):
    """선택된 여러 수량산출부재에 대해 일람부호를 일괄 할당/해제하는 API"""
    try:
        data = json.loads(request.body)
        member_ids = data.get('member_ids', [])
        mark_id = data.get('mark_id') # 설정할 단일 일람부호 ID
        action = data.get('action') # 'assign' 또는 'clear'

        if not all([member_ids, action]):
            return JsonResponse({'status': 'error', 'message': '필수 파라미터가 누락되었습니다.'}, status=400)

        members_to_update = QuantityMember.objects.filter(project_id=project_id, id__in=member_ids)
        
        if action == 'assign':
            if not mark_id:
                return JsonResponse({'status': 'error', 'message': '할당할 일람부호 ID가 필요합니다.'}, status=400)
            mark_to_assign = MemberMark.objects.get(id=mark_id, project_id=project_id)
            
            # [핵심 수정] update()를 사용하여 한번의 쿼리로 여러 부재를 업데이트합니다.
            updated_count = members_to_update.update(member_mark=mark_to_assign)
            message = f'{updated_count}개 부재의 일람부호를 "{mark_to_assign.mark}"(으)로 설정했습니다.'

        elif action == 'clear':
            # [핵심 수정] member_mark를 NULL로 설정합니다.
            updated_count = members_to_update.update(member_mark=None)
            message = f'{updated_count}개 부재의 일람부호를 제거했습니다.'
        
        else:
            return JsonResponse({'status': 'error', 'message': '잘못된 action입니다. "assign" 또는 "clear"를 사용하세요.'}, status=400)

        return JsonResponse({'status': 'success', 'message': message})

    except MemberMark.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '존재하지 않는 일람부호입니다.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_http_methods(["POST"])
def manage_quantity_member_spaces_api(request, project_id):
    """선택된 여러 수량산출부재에 대해 공간분류를 일괄 할당/해제하는 API"""
    try:
        data = json.loads(request.body)
        member_ids = data.get('member_ids', [])
        space_id = data.get('space_id')
        action = data.get('action')

        if not all([member_ids, action]):
            return JsonResponse({'status': 'error', 'message': '필수 파라미터가 누락되었습니다.'}, status=400)

        members = QuantityMember.objects.filter(project_id=project_id, id__in=member_ids)
        
        if action == 'assign':
            if not space_id:
                return JsonResponse({'status': 'error', 'message': '할당할 공간분류 ID가 필요합니다.'}, status=400)
            space_to_add = SpaceClassification.objects.get(id=space_id, project_id=project_id)
            for member in members:
                member.space_classifications.add(space_to_add)
            message = f"{len(member_ids)}개 부재에 '{space_to_add.name}' 공간을 할당했습니다."

        elif action == 'clear':
            for member in members:
                member.space_classifications.clear()
            message = f"{len(member_ids)}개 부재의 모든 공간분류를 제거했습니다."
        
        else:
            return JsonResponse({'status': 'error', 'message': '잘못된 action입니다. "assign" 또는 "clear"를 사용하세요.'}, status=400)

        return JsonResponse({'status': 'success', 'message': message})

    except SpaceClassification.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '존재하지 않는 공간분류입니다.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


# ▼▼▼ [추가] 공사코드 룰셋 API 함수 블록 ▼▼▼
@require_http_methods(["GET", "POST", "DELETE"])
def cost_code_rules_api(request, project_id, rule_id=None):
    if request.method == 'GET':
        rules = CostCodeRule.objects.filter(project_id=project_id).select_related('target_cost_code')
        rules_data = [{
            'id': str(rule.id), 'name': rule.name, 'description': rule.description,
            'target_cost_code_id': str(rule.target_cost_code.id),
            'target_cost_code_name': f"{rule.target_cost_code.code} - {rule.target_cost_code.name}",
            'conditions': rule.conditions,
            'quantity_mapping_script': rule.quantity_mapping_script,
            'priority': rule.priority,
        } for rule in rules]
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            target_cost_code = CostCode.objects.get(id=data.get('target_cost_code_id'), project=project)
            
            rule_id_from_data = data.get('id')
            rule = CostCodeRule.objects.get(id=rule_id_from_data, project=project) if rule_id_from_data else CostCodeRule(project=project)

            rule.name = data.get('name', '이름 없는 규칙')
            rule.description = data.get('description', '')
            rule.target_cost_code = target_cost_code
            rule.conditions = data.get('conditions', [])
            rule.quantity_mapping_script = data.get('quantity_mapping_script', {})
            rule.priority = data.get('priority', 0)
            rule.save()
            return JsonResponse({'status': 'success', 'message': '공사코드 룰셋이 저장되었습니다.', 'rule_id': str(rule.id)})
        except (Project.DoesNotExist, CostCode.DoesNotExist, CostCodeRule.DoesNotExist) as e:
            return JsonResponse({'status': 'error', 'message': f'데이터를 찾을 수 없습니다: {str(e)}'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'저장 중 오류 발생: {str(e)}'}, status=400)

    elif request.method == 'DELETE':
        if not rule_id: return JsonResponse({'status': 'error', 'message': 'Rule ID가 필요합니다.'}, status=400)
        try:
            rule = CostCodeRule.objects.get(id=rule_id, project_id=project_id)
            rule.delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except CostCodeRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)


@require_http_methods(["GET", "POST", "DELETE"])
def member_mark_assignment_rules_api(request, project_id, rule_id=None):
    if request.method == 'GET':
        rules = MemberMarkAssignmentRule.objects.filter(project_id=project_id)
        rules_data = [{'id': str(r.id), 'name': r.name, 'conditions': r.conditions, 'mark_expression': r.mark_expression, 'priority': r.priority} for r in rules]
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            rule = MemberMarkAssignmentRule.objects.get(id=data.get('id'), project=project) if data.get('id') else MemberMarkAssignmentRule(project=project)
            rule.name = data.get('name', '이름 없는 규칙')
            rule.conditions = data.get('conditions', [])
            rule.mark_expression = data.get('mark_expression', '')
            rule.priority = data.get('priority', 0)
            rule.save()
            return JsonResponse({'status': 'success', 'message': '일람부호 할당 규칙이 저장되었습니다.', 'rule_id': str(rule.id)})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            MemberMarkAssignmentRule.objects.get(id=rule_id, project_id=project_id).delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except MemberMarkAssignmentRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)

@require_http_methods(["GET", "POST", "DELETE"])
def cost_code_assignment_rules_api(request, project_id, rule_id=None):
    if request.method == 'GET':
        rules = CostCodeAssignmentRule.objects.filter(project_id=project_id)
        rules_data = [{'id': str(r.id), 'name': r.name, 'conditions': r.conditions, 'cost_code_expressions': r.cost_code_expressions, 'priority': r.priority} for r in rules]
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            rule = CostCodeAssignmentRule.objects.get(id=data.get('id'), project=project) if data.get('id') else CostCodeAssignmentRule(project=project)
            rule.name = data.get('name', '이름 없는 규칙')
            rule.conditions = data.get('conditions', [])
            rule.cost_code_expressions = data.get('cost_code_expressions', {})
            rule.priority = data.get('priority', 0)
            rule.save()
            return JsonResponse({'status': 'success', 'message': '공사코드 할당 규칙이 저장되었습니다.', 'rule_id': str(rule.id)})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            CostCodeAssignmentRule.objects.get(id=rule_id, project_id=project_id).delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except CostCodeAssignmentRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)


@require_http_methods(["GET", "POST", "DELETE"])
def space_assignment_rules_api(request, project_id, rule_id=None):
    if request.method == 'GET':
        rules = SpaceAssignmentRule.objects.filter(project_id=project_id)
        rules_data = [{
            'id': str(r.id), 
            'name': r.name, 
            'member_filter_conditions': r.member_filter_conditions,
            'member_join_property': r.member_join_property,
            'space_join_property': r.space_join_property,
            'priority': r.priority
        } for r in rules]
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            rule, created = SpaceAssignmentRule.objects.update_or_create(
                id=data.get('id'),
                project=project,
                defaults={
                    'name': data.get('name', '이름 없는 규칙'),
                    'member_filter_conditions': data.get('member_filter_conditions', []),
                    'member_join_property': data.get('member_join_property'),
                    'space_join_property': data.get('space_join_property'),
                    'priority': data.get('priority', 0)
                }
            )
            return JsonResponse({'status': 'success', 'message': '동적 공간 할당 규칙이 저장되었습니다.', 'rule_id': str(rule.id)})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            SpaceAssignmentRule.objects.get(id=rule_id, project_id=project_id).delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except SpaceAssignmentRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)

def evaluate_expression_for_cost_item(expression, quantity_member):
    if not isinstance(expression, str) or not quantity_member:
        return expression

    temp_expression = expression
    
    # 1단계: [MemberMark 속성] 처리 - 대괄호 []
    mark_placeholders = re.findall(r'\[([^\]]+)\]', temp_expression)
    if mark_placeholders:
        # ▼▼▼ [핵심 수정] .member_marks.first() 대신 .member_mark 를 직접 사용합니다. ▼▼▼
        member_mark = quantity_member.member_mark
        if member_mark and member_mark.properties:
            for placeholder in set(mark_placeholders):
                value = member_mark.properties.get(placeholder)
                if value is not None:
                    replacement = str(value) if is_numeric(value) else f'"{str(value)}"'
                    temp_expression = temp_expression.replace(f'[{placeholder}]', replacement)
                else: # 해당 속성이 없으면 0으로 처리하여 계산 오류 방지
                    temp_expression = temp_expression.replace(f'[{placeholder}]', '0')
        else: # 연결된 일람부호가 없으면 모든 대괄호 플레이스홀더를 0으로 처리
            for placeholder in set(mark_placeholders):
                temp_expression = temp_expression.replace(f'[{placeholder}]', '0')


    # 2단계: {QuantityMember 속성} 처리 - 중괄호 {}
    member_placeholders = re.findall(r'\{([^}]+)\}', temp_expression)
    if member_placeholders and quantity_member.properties:
        for placeholder in set(member_placeholders):
            value = quantity_member.properties.get(placeholder)
            if value is not None:
                replacement = str(value) if is_numeric(value) else f'"{str(value)}"'
                temp_expression = temp_expression.replace(f'{{{placeholder}}}', replacement)
            else:
                temp_expression = temp_expression.replace(f'{{{placeholder}}}', '0')

    # 3단계: 최종 문자열 계산
    if not temp_expression.strip(): return ""
    try:
        safe_dict = {'__builtins__': {'abs': abs, 'round': round, 'max': max, 'min': min, 'len': len}}
        return eval(temp_expression, safe_dict)
    except Exception:
        return f"Error: Failed to evaluate '{expression}' -> '{temp_expression}'"

# connections/views.py 파일에서 cost_items_api 함수를 찾아 아래 코드로 교체하세요.

@require_http_methods(["GET", "POST", "PUT", "DELETE"])
def cost_items_api(request, project_id, item_id=None):
    if request.method == 'GET':
        items = CostItem.objects.filter(project_id=project_id).select_related(
            'cost_code', 
            'quantity_member__raw_element', 
            'quantity_member__member_mark'
        )
        
        data = []
        for item in items:
            item_data = {
                'id': str(item.id),
                'quantity': item.quantity,
                'quantity_mapping_expression': item.quantity_mapping_expression,
                'cost_code_name': f"{item.cost_code.code} - {item.cost_code.name}" if item.cost_code else "미지정",
                'quantity_member_id': str(item.quantity_member_id) if item.quantity_member_id else None,
                'description': item.description,
                'quantity_member_properties': {},
                'member_mark_properties': {},
                'raw_element_properties': {}
            }
            
            if item.quantity_member:
                item_data['quantity_member_properties'] = item.quantity_member.properties or {}
                
                if item.quantity_member.member_mark:
                    item_data['member_mark_properties'] = item.quantity_member.member_mark.properties or {}
                
                # ▼▼▼ [핵심 수정] RawElement의 모든 속성을 단순화하여 통합하는 로직 ▼▼▼
                if item.quantity_member.raw_element:
                    raw_data = item.quantity_member.raw_element.raw_data or {}
                    flat_raw_props = {}

                    # 1. raw_data의 최상위 레벨 속성을 먼저 추가합니다.
                    for key, value in raw_data.items():
                        if not isinstance(value, (dict, list)):
                            flat_raw_props[key] = value
                    
                    # 2. TypeParameters의 속성을 추가합니다. (키가 중복되면 덮어씁니다)
                    for key, value in raw_data.get('TypeParameters', {}).items():
                        flat_raw_props[key] = value

                    # 3. Parameters의 속성을 추가합니다. (가장 구체적인 정보이므로 마지막에 덮어씁니다)
                    for key, value in raw_data.get('Parameters', {}).items():
                        flat_raw_props[key] = value
                        
                    item_data['raw_element_properties'] = flat_raw_props
                # ▲▲▲ [핵심 수정] 여기까지 입니다. ▲▲▲

            data.append(item_data)
            
        return JsonResponse(data, safe=False)

    elif request.method == 'POST':
        # (POST 로직은 변경 없음)
        try:
            data = json.loads(request.body)
            project = Project.objects.get(id=project_id)
            cost_code = CostCode.objects.get(id=data.get('cost_code_id'), project=project)

            new_item = CostItem.objects.create(
                project=project,
                cost_code=cost_code,
                description="수동 생성됨",
            )
            return JsonResponse({'status': 'success', 'message': '새 산출항목이 수동으로 생성되었습니다.', 'item_id': str(new_item.id)})
        except (Project.DoesNotExist, CostCode.DoesNotExist):
            return JsonResponse({'status': 'error', 'message': '프로젝트 또는 공사코드를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'생성 중 오류 발생: {str(e)}'}, status=400)

    elif request.method == 'PUT':
        # (PUT 로직은 변경 없음)
        if not item_id: return JsonResponse({'status': 'error', 'message': 'Item ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            item = CostItem.objects.select_related('quantity_member').get(id=item_id, project_id=project_id)

            if 'quantity_mapping_expression' in data:
                item.quantity_mapping_expression = data['quantity_mapping_expression']
            
            if item.quantity_mapping_expression and item.quantity_member:
                script = item.quantity_mapping_expression.get('수량', 0)
                calculated_qty = evaluate_expression_for_cost_item(script, item.quantity_member)
                item.quantity = float(calculated_qty) if is_numeric(calculated_qty) else 0.0
            elif 'quantity' in data:
                item.quantity = data['quantity']
            
            if 'description' in data: item.description = data['description']

            item.save()
            return JsonResponse({
                'status': 'success', 'message': '산출항목이 수정되었습니다.',
                'updated_item': { 'id': str(item.id), 'quantity': item.quantity }
            })
        except CostItem.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 산출항목을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        # (DELETE 로직은 변경 없음)
        if not item_id: return JsonResponse({'status': 'error', 'message': 'Item ID가 필요합니다.'}, status=400)
        try:
            item = CostItem.objects.get(id=item_id, project_id=project_id)
            item.delete()
            return JsonResponse({'status': 'success', 'message': '산출항목이 삭제되었습니다.'})
        except CostItem.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 산출항목을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)



@require_http_methods(["POST"])
def create_cost_items_auto_view(request, project_id):
    try:
        project = Project.objects.get(id=project_id)
        rules = CostCodeRule.objects.filter(project=project).order_by('priority').select_related('target_cost_code')
        
        # [핵심 수정] DB 조회를 최적화하기 위해 연관된 모델들을 미리 불러옵니다.
        members = QuantityMember.objects.filter(
            project=project, 
            cost_codes__isnull=False
        ).select_related(
            'member_mark', 
            'raw_element' # RawElement도 함께 불러옵니다.
        ).prefetch_related(
            'cost_codes'
        ).distinct()

        if not rules.exists():
            return JsonResponse({'status': 'info', 'message': '자동 생성을 위한 공사코드 룰셋이 없습니다.'})
        if not members.exists():
            return JsonResponse({'status': 'info', 'message': '공사코드가 할당된 수량산출부재가 없습니다.'})

        valid_item_ids = set()
        created_count = 0
        updated_count = 0

        for member in members:
            # [핵심 수정] 규칙 평가를 위한 통합 속성 딕셔너리를 생성합니다.
            combined_properties = member.properties.copy() if member.properties else {}

            # 1. 일람부호 속성을 '일람부호.' 접두사와 함께 추가합니다.
            if member.member_mark and member.member_mark.properties:
                for key, value in member.member_mark.properties.items():
                    combined_properties[f'일람부호.{key}'] = value

            # 2. BIM 원본 데이터 속성을 'BIM원본.' 접두사와 함께 추가합니다.
            if member.raw_element and member.raw_element.raw_data:
                raw_data = member.raw_element.raw_data
                # 최상위 키-값 추가
                for key, value in raw_data.items():
                    if not isinstance(value, (dict, list)):
                        combined_properties[f'BIM원본.{key}'] = value
                # TypeParameters 추가
                for key, value in raw_data.get('TypeParameters', {}).items():
                    combined_properties[f'BIM원본.{key}'] = value
                # Parameters 추가 (가장 구체적이므로 마지막에 덮어씁니다)
                for key, value in raw_data.get('Parameters', {}).items():
                    combined_properties[f'BIM원본.{key}'] = value

            for cost_code in member.cost_codes.all():
                item, created = CostItem.objects.get_or_create(
                    project=project,
                    quantity_member=member,
                    cost_code=cost_code
                )
                
                if created: created_count += 1
                else: updated_count += 1
                
                script_to_use = None
                
                if item.quantity_mapping_expression and isinstance(item.quantity_mapping_expression, dict) and item.quantity_mapping_expression:
                    script_to_use = item.quantity_mapping_expression
                else:
                    for rule in rules:
                        # [핵심 수정] member.properties 대신 통합 속성(combined_properties)을 기준으로 조건을 평가합니다.
                        if rule.target_cost_code_id == cost_code.id and evaluate_conditions(combined_properties, rule.conditions):
                            script_to_use = rule.quantity_mapping_script
                            break

                final_qty = 0.0
                if script_to_use:
                    qty_script = script_to_use.get('수량', 0)
                    calculated_qty = evaluate_expression_for_cost_item(qty_script, member)
                    final_qty = float(calculated_qty) if is_numeric(calculated_qty) else 0.0
                
                if item.quantity != final_qty:
                    item.quantity = final_qty
                    item.save(update_fields=['quantity'])

                valid_item_ids.add(item.id)

        deletable_items = CostItem.objects.filter(project=project, quantity_member__isnull=False).exclude(id__in=valid_item_ids)
        deleted_count, _ = deletable_items.delete()

        message = f'룰셋/개별 맵핑식을 적용하여 {created_count}개 항목 생성, {updated_count}개 업데이트, {deleted_count}개 삭제했습니다.'
        return JsonResponse({'status': 'success', 'message': message})

    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        import traceback
        return JsonResponse({'status': 'error', 'message': f'자동 생성 중 오류 발생: {str(e)}', 'details': traceback.format_exc()}, status=500)



def evaluate_member_properties_expression(expression, member_properties):
    """
    '{면적} * 2' 와 같은 문자열 표현식을 QuantityMember의 속성 값으로 계산합니다.
    """
    if not isinstance(expression, str):
        return expression

    temp_expression = expression
    placeholders = re.findall(r'\{([^}]+)\}', temp_expression)
    
    for placeholder in set(placeholders):
        value = member_properties.get(placeholder)
        if value is not None:
            replacement = str(value) if is_numeric(value) else f'"{str(value)}"'
            temp_expression = temp_expression.replace(f'{{{placeholder}}}', replacement)
        else:
            # 해당 속성이 없으면 빈 문자열로 처리하여 문자열 조합에 사용될 수 있도록 함
            temp_expression = temp_expression.replace(f'{{{placeholder}}}', '""')
            
    try:
        safe_dict = {'__builtins__': {'abs': abs, 'round': round, 'max': max, 'min': min, 'len': len, 'str': str, 'int': int, 'float': float}}
        return eval(temp_expression, safe_dict)
    except Exception:
        # eval 실패 시, 단순 문자열 조합 결과일 수 있으므로 temp_expression을 그대로 반환
        return temp_expression

def get_property_value(instance, property_path, instance_type):
    """
    점(.)으로 구분된 경로를 사용하여 인스턴스의 속성 값을 가져오는 헬퍼 함수
    instance_type: 'member' 또는 'space'
    """
    if not property_path:
        return None

    current_object = instance
    path_parts = property_path.split('.')
    
    # 1. 첫 번째 경로 처리 (기본 속성 또는 관계)
    if path_parts[0] == 'BIM원본':
        if instance_type == 'member' and hasattr(instance, 'raw_element'):
            current_object = instance.raw_element.raw_data if instance.raw_element else {}
        elif instance_type == 'space' and hasattr(instance, 'source_element'):
            current_object = instance.source_element.raw_data if instance.source_element else {}
        else:
            return None # BIM 원본이 없음
        
        path_parts.pop(0) # 'BIM원본' 제거
        
    elif path_parts[0] == 'Name' and instance_type == 'space':
         return instance.name

    # 2. 나머지 경로 순회 (Parameters, TypeParameters 등)
    for part in path_parts:
        if isinstance(current_object, dict):
            current_object = current_object.get(part)
        else:
            current_object = getattr(current_object, part, None)
        
        if current_object is None:
            return None

    # 콜론(:) 파싱 로직 적용
    if isinstance(current_object, str) and ': ' in current_object:
        try:
            return current_object.split(': ', 1)[1]
        except IndexError:
            return current_object
    
    return current_object

@require_http_methods(["POST"])
def apply_assignment_rules_view(request, project_id):
    try:
        project = Project.objects.get(id=project_id)
        members = list(QuantityMember.objects.filter(project=project).select_related('raw_element', 'member_mark').prefetch_related('cost_codes', 'space_classifications'))
        
        # 모든 종류의 할당 룰셋 로드
        mark_rules = list(MemberMarkAssignmentRule.objects.filter(project=project).order_by('priority'))
        cost_code_rules = list(CostCodeAssignmentRule.objects.filter(project=project).order_by('priority'))
        dynamic_space_rules = list(SpaceAssignmentRule.objects.filter(project=project).order_by('priority'))

        updated_mark_count = 0
        updated_cost_code_count = 0
        updated_space_count = 0

        # --- 1. 부재별로 순회하며 모든 룰셋 적용 ---
        for member in members:
            # 1-1. 모든 속성을 종합한 'combined_properties' 딕셔너리 생성
            combined_properties = member.properties.copy() if member.properties else {}
            if member.raw_element and member.raw_element.raw_data:
                raw_data = member.raw_element.raw_data
                for k, v in raw_data.items():
                    if not isinstance(v, (dict, list)): combined_properties[f'BIM원본.{k}'] = v
                for k, v in raw_data.get('TypeParameters', {}).items(): combined_properties[f'BIM원본.{k}'] = v
                for k, v in raw_data.get('Parameters', {}).items(): combined_properties[f'BIM원본.{k}'] = v

            # --- 2. 일람부호 할당 로직 (기존 로직 복원) ---
            mark_expr = member.member_mark_expression
            if not mark_expr:
                for rule in mark_rules:
                    if evaluate_conditions(combined_properties, rule.conditions):
                        mark_expr = rule.mark_expression
                        break
            if mark_expr:
                evaluated_mark_value = evaluate_member_properties_expression(mark_expr, combined_properties)
                if evaluated_mark_value:
                    mark_obj, _ = MemberMark.objects.get_or_create(project=project, mark=str(evaluated_mark_value), defaults={'description': '룰셋에 의해 자동 생성됨'})
                    if member.member_mark != mark_obj:
                        member.member_mark = mark_obj
                        member.save(update_fields=['member_mark'])
                        updated_mark_count += 1

            # --- 3. 공사코드 할당 로직 (기존 로직 복원) ---
            cost_code_exprs_list = member.cost_code_expressions
            if not cost_code_exprs_list:
                matching_expressions = []
                for rule in cost_code_rules:
                    if evaluate_conditions(combined_properties, rule.conditions):
                        matching_expressions.append(rule.cost_code_expressions)
                cost_code_exprs_list = matching_expressions
            
            if cost_code_exprs_list:
                codes_changed = False
                current_codes_before = set(member.cost_codes.all())
                newly_added_codes = set()
                
                for expr_set in cost_code_exprs_list:
                    code_val = evaluate_member_properties_expression(expr_set.get('code', ''), combined_properties)
                    name_val = evaluate_member_properties_expression(expr_set.get('name', ''), combined_properties)
                    if code_val and name_val:
                        code_obj, _ = CostCode.objects.get_or_create(project=project, code=str(code_val), defaults={'name': str(name_val), 'description': '룰셋에 의해 자동 생성됨'})
                        member.cost_codes.add(code_obj)
                        newly_added_codes.add(code_obj)

                if not newly_added_codes.issubset(current_codes_before):
                    updated_cost_code_count += 1

        # --- 4. 동적 공간분류 할당 로직 (수정된 로직) ---
        if dynamic_space_rules:
            all_spaces = list(SpaceClassification.objects.filter(project=project).select_related('source_element'))
            temp_updated_space_count = 0

            for rule in dynamic_space_rules:
                members_map = {}
                for member in members:
                    if rule.member_filter_conditions and not evaluate_conditions(combined_properties, rule.member_filter_conditions):
                        continue
                    
                    join_key = get_property_value(member, rule.member_join_property, 'member')
                    if join_key is not None:
                        join_key_str = str(join_key)
                        if join_key_str not in members_map: members_map[join_key_str] = []
                        members_map[join_key_str].append(member)

                spaces_map = {}
                for space in all_spaces:
                    join_key = get_property_value(space, rule.space_join_property, 'space')
                    if join_key is not None:
                        spaces_map[str(join_key)] = space
                
                for key, member_list in members_map.items():
                    if key in spaces_map:
                        space_to_assign = spaces_map[key]
                        for member in member_list:
                            # ManyToManyField는 .add() 전에 .all()을 호출할 필요가 없습니다.
                            member.space_classifications.add(space_to_assign)
                            # 카운트는 실제 변경이 일어났는지 확인하는 것보다, 시도 횟수를 세는 것이 더 간단합니다.
                temp_updated_space_count = len(members_map) # 규칙 적용 대상 부재 수로 카운트 (단순화)
            updated_space_count = temp_updated_space_count


        message = f'룰셋 적용 완료! 일람부호 {updated_mark_count}개, 공사코드 {updated_cost_code_count}개, 공간분류 {updated_space_count}개 부재가 업데이트되었습니다.'
        return JsonResponse({'status': 'success', 'message': message})

    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        import traceback
        return JsonResponse({'status': 'error', 'message': f'룰셋 적용 중 오류 발생: {str(e)}', 'details': traceback.format_exc()}, status=500)
@require_http_methods(["GET"])
def get_boq_grouping_fields_api(request, project_id):
    """
    BOQ 집계 시 사용할 수 있는 필드 목록을 CostItem 기준으로 동적으로 생성하여 반환합니다.
    [수정됨] RawElement의 raw_data 속성까지 동적으로 분석하여 포함합니다.
    """
    fields = []
    existing_values = set()

    def add_field(value, label):
        if value not in existing_values:
            fields.append({'value': value, 'label': label})
            existing_values.add(value)

    # 1. CostItem 및 연관 모델의 고정 필드를 먼저 추가합니다.
    add_field('cost_code__code', '공사코드 - 코드')
    add_field('cost_code__name', '공사코드 - 품명')
    add_field('cost_code__spec', '공사코드 - 규격')
    add_field('cost_code__unit', '공사코드 - 단위')
    add_field('cost_code__category', '공사코드 - 카테고리')
    add_field('quantity_member__name', '산출부재 - 이름')
    add_field('quantity_member__classification_tag__name', '산출부재 - 수량산출분류')
    add_field('quantity_member__member_mark__mark', '일람부호 - 부호명')

    # 2. DB에서 최근 100개의 CostItem을 샘플링하여 JSON 필드 키를 분석합니다.
    #    (전체 데이터를 스캔하는 것을 방지하여 성능 확보)
    sample_items = CostItem.objects.filter(
        project_id=project_id, 
        quantity_member__raw_element__isnull=False
    ).select_related(
        'quantity_member__member_mark',
        'quantity_member__raw_element'
    ).order_by('-created_at')[:100]

    for item in sample_items:
        member = item.quantity_member
        if not member:
            continue

        # 2-1. QuantityMember의 'properties' (부재속성) 분석
        if member.properties and isinstance(member.properties, dict):
            for key in member.properties.keys():
                add_field(f'quantity_member__properties__{key}', f'부재속성 - {key}')

        # 2-2. MemberMark의 'properties' (일람부호 속성) 분석
        if member.member_mark and member.member_mark.properties and isinstance(member.member_mark.properties, dict):
            for key in member.member_mark.properties.keys():
                add_field(f'quantity_member__member_mark__properties__{key}', f'일람부호 속성 - {key}')
        
        # 2-3. RawElement의 'raw_data' (BIM원본) 분석
        if member.raw_element and member.raw_element.raw_data and isinstance(member.raw_element.raw_data, dict):
            raw_data = member.raw_element.raw_data
            
            # raw_data의 3가지 레벨(최상위, TypeParameters, Parameters)을 모두 순회합니다.
            source_map = {
                'BIM원본': raw_data,
                'BIM원본 (타입)': raw_data.get('TypeParameters', {}),
                'BIM원본 (인스턴스)': raw_data.get('Parameters', {})
            }

            for prefix, data_dict in source_map.items():
                if not isinstance(data_dict, dict): continue

                for key, value in data_dict.items():
                    # 값이 딕셔너리나 리스트가 아닌 경우만 필드로 추가
                    if not isinstance(value, (dict, list)):
                        # 프론트엔드로 보낼 고유 경로 생성
                        path_suffix = key
                        if prefix == 'BIM원본 (타입)':
                            path_suffix = f'TypeParameters__{key}'
                        elif prefix == 'BIM원본 (인스턴스)':
                            path_suffix = f'Parameters__{key}'
                        
                        value_path = f'quantity_member__raw_element__raw_data__{path_suffix}'
                        add_field(value_path, f'{prefix} - {key}')

    return JsonResponse(sorted(fields, key=lambda x: x['label']), safe=False)

# connections/views.py

# 기존 generate_boq_report_api 함수를 찾아서 아래 코드로 완전히 교체하세요.

@require_http_methods(["GET"])
def generate_boq_report_api(request, project_id):
    """(개선된 버전) 사용자가 요청한 모든 종류의 그룹핑/표시 기준에 따라 CostItem을 집계합니다."""
    group_by_fields = request.GET.getlist('group_by')
    display_by_fields = request.GET.getlist('display_by')
    raw_element_ids = request.GET.getlist('raw_element_ids') # Revit 필터링을 위한 ID 리스트

    if not group_by_fields:
        return JsonResponse({'status': 'error', 'message': '하나 이상의 그룹핑 기준을 선택해야 합니다.'}, status=400)

    # --- 1. 필드 유형 분리 (DB 직접 조회 필드 vs JSON 파싱 필드) ---
    direct_fields = set(['id', 'quantity']) # id와 quantity는 항상 필요
    json_fields = set()
    all_requested_fields = set(group_by_fields + display_by_fields)

    for field in all_requested_fields:
        if '__properties__' in field or '__raw_data__' in field:
            json_fields.add(field)
        else:
            direct_fields.add(field)

    # --- 2. DB에서 필요한 모든 데이터를 한 번에 조회 ---
    values_to_fetch = list(direct_fields)
    # JSON 필드가 요청되면, 해당 JSON 전체를 가져옵니다.
    if any('__properties__' in f for f in json_fields):
        values_to_fetch.extend(['quantity_member__properties', 'quantity_member__member_mark__properties'])
    if any('__raw_data__' in f for f in json_fields):
        values_to_fetch.append('quantity_member__raw_element__raw_data')

    # Revit 선택 필터링 적용
    items_qs = CostItem.objects.filter(project_id=project_id)
    if raw_element_ids:
        items_qs = items_qs.filter(quantity_member__raw_element_id__in=raw_element_ids)

    items_from_db = items_qs.select_related(
        'cost_code', 'quantity_member__classification_tag',
        'quantity_member__member_mark', 'quantity_member__raw_element'
    ).values(*set(values_to_fetch))


    # --- 3. Python에서 JSON 필드 값 파싱 및 데이터 재가공 ---
    def get_value_from_path(item, path):
        if '__properties__' in path:
            parts = path.split('__properties__')
            base_path, key = parts[0], parts[1]
            prop_dict = item.get(f'{base_path}__properties')
            return prop_dict.get(key) if isinstance(prop_dict, dict) else None

        if '__raw_data__' in path:
            raw_data_dict = item.get('quantity_member__raw_element__raw_data')
            if not isinstance(raw_data_dict, dict): return None
            
            # `...__raw_data__` 이후의 경로를 `__` 기준으로 분리
            key_path = path.split('__raw_data__')[1].strip('_').split('__')
            
            # reduce를 사용하여 중첩된 딕셔너리 값 탐색
            return reduce(lambda d, key: d.get(key, None) if isinstance(d, dict) else None, key_path, raw_data_dict)
            
        return item.get(path)

    items = []
    for db_item in items_from_db:
        processed_item = {k: v for k, v in db_item.items()}
        for field in all_requested_fields:
            # 모든 요청된 필드 값을 미리 계산하여 processed_item에 저장
            processed_item[field] = get_value_from_path(db_item, field)
        items.append(processed_item)

    # --- 4. 데이터 집계 로직 ---
    root = {'name': 'Total', 'quantity': 0, 'count': 0, 'children': {}, 'display_values': {}, 'item_ids': []}
    VARIOUS_VALUES_SENTINEL = object() # '<다양함>' 표시를 위한 특별 객체

    for item in items:
        root['item_ids'].append(item['id'])
        current_level = root
        
        for i, field in enumerate(group_by_fields):
            key = item.get(field)
            key_str = str(key) if key is not None else '(값 없음)'

            if key_str not in current_level['children']:
                current_level['children'][key_str] = {
                    'name': key_str, 'quantity': 0, 'count': 0, 'level': i,
                    'children': {}, 'display_values': {}, 'item_ids': []
                }
            
            current_level = current_level['children'][key_str]
            current_level['quantity'] += item.get('quantity', 0)
            current_level['count'] += 1
            current_level['item_ids'].append(item['id'])

            # 표시 필드 값 처리
            for display_field in display_by_fields:
                current_value = item.get(display_field)
                if display_field not in current_level['display_values']:
                    current_level['display_values'][display_field] = current_value
                elif current_level['display_values'][display_field] != current_value and \
                     current_level['display_values'][display_field] is not VARIOUS_VALUES_SENTINEL:
                    current_level['display_values'][display_field] = VARIOUS_VALUES_SENTINEL

    # --- 5. 최종 결과 포맷팅 (재귀 함수) ---
    def format_to_list(node):
        children_list = []
        for key, child_node in sorted(node['children'].items()):
            final_display_values = {}
            for field in display_by_fields:
                value = child_node['display_values'].get(field)
                # 프론트엔드에서 사용하기 편하도록 키에서 __를 _로 변경
                frontend_key = field.replace('__', '_')
                final_display_values[frontend_key] = '<다양함>' if value is VARIOUS_VALUES_SENTINEL else (value if value is not None else '')

            child_list_item = {
                'name': child_node['name'], 'quantity': child_node['quantity'],
                'count': child_node['count'], 'level': child_node['level'],
                'display_values': final_display_values, 
                'children': format_to_list(child_node),
                'item_ids': child_node['item_ids']
            }
            children_list.append(child_list_item)
        return children_list

    report_data = format_to_list(root)
    total_summary = {
        'total_quantity': sum(item.get('quantity', 0) for item in items),
        'total_count': len(items)
    }

    return JsonResponse({'report': report_data, 'summary': total_summary}, safe=False)



# 기존 space_classifications_api 함수를 찾아 아래 코드로 교체해주세요.
@require_http_methods(["GET", "POST", "PUT", "DELETE"])
def space_classifications_api(request, project_id, sc_id=None):
    # --- GET: 공간분류 목록 조회 ---
    if request.method == 'GET':
        # ▼▼▼ [수정] .annotate()를 사용하여 연결된 객체 수를 계산합니다. ▼▼▼
        spaces = SpaceClassification.objects.filter(project_id=project_id).annotate(
            mapped_elements_count=Count('mapped_elements')
        )
        data = [{
            'id': str(space.id),
            'name': space.name,
            'description': space.description,
            'parent_id': str(space.parent_id) if space.parent_id else None,
            'mapped_elements_count': space.mapped_elements_count, # 계산된 값을 추가
        } for space in spaces]
        # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
        return JsonResponse(data, safe=False)

    # --- POST: 새 공간분류 생성 ---
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            project = Project.objects.get(id=project_id)
            parent = SpaceClassification.objects.get(id=data.get('parent_id')) if data.get('parent_id') else None
            
            if not data.get('name'):
                return JsonResponse({'status': 'error', 'message': '이름은 필수 항목입니다.'}, status=400)

            new_space = SpaceClassification.objects.create(
                project=project,
                name=data.get('name'),
                description=data.get('description', ''),
                parent=parent
            )
            return JsonResponse({'status': 'success', 'message': '새 공간분류가 생성되었습니다.', 'new_space': {'id': str(new_space.id), 'name': new_space.name, 'parent_id': str(new_space.parent_id) if new_space.parent_id else None, 'mapped_elements_count': 0}})
        except Project.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
        except SpaceClassification.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '부모 공간분류를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'저장 중 오류 발생: {str(e)}'}, status=400)

    # --- PUT: 공간분류 수정 ---
    elif request.method == 'PUT':
        # (이 부분은 수정사항 없습니다)
        if not sc_id:
            return JsonResponse({'status': 'error', 'message': '공간분류 ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            space = SpaceClassification.objects.get(id=sc_id, project_id=project_id)
            space.name = data.get('name', space.name)
            space.description = data.get('description', space.description)
            space.save()
            return JsonResponse({'status': 'success', 'message': '공간분류가 수정되었습니다.'})
        except SpaceClassification.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '해당 공간분류를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    # --- DELETE: 공간분류 삭제 ---
    elif request.method == 'DELETE':
        # (이 부분은 수정사항 없습니다)
        if not sc_id:
            return JsonResponse({'status': 'error', 'message': '공간분류 ID가 필요합니다.'}, status=400)
        try:
            space = SpaceClassification.objects.get(id=sc_id, project_id=project_id)
            space.delete() # on_delete=CASCADE 설정으로 자식들도 함께 삭제됨
            return JsonResponse({'status': 'success', 'message': '공간분류가 삭제되었습니다.'})
        except SpaceClassification.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '공간분류를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'삭제 중 오류 발생: {str(e)}'}, status=500)
        


@require_http_methods(["POST"])
def manage_space_element_mapping_api(request, project_id):
    """특정 공간분류에 BIM 원본 객체(RawElement)들을 맵핑/해제하는 API"""
    try:
        data = json.loads(request.body)
        space_id = data.get('space_id')
        element_ids = data.get('element_ids', [])
        action = data.get('action')  # 'assign' (할당), 'clear' (해제)

        if not all([space_id, action]):
            return JsonResponse({'status': 'error', 'message': '필수 파라미터가 누락되었습니다.'}, status=400)

        space = SpaceClassification.objects.get(id=space_id, project_id=project_id)
        elements = RawElement.objects.filter(project_id=project_id, id__in=element_ids)

        if action == 'assign':
            space.mapped_elements.set(elements) # set()은 기존 연결을 모두 지우고 새로 설정합니다.
            message = f"'{space.name}' 공간에 {elements.count()}개의 BIM 객체를 맵핑했습니다."
        elif action == 'clear':
            space.mapped_elements.clear()
            message = f"'{space.name}' 공간에 맵핑된 모든 BIM 객체를 해제했습니다."
        else:
            return JsonResponse({'status': 'error', 'message': '잘못된 action입니다.'}, status=400)

        return JsonResponse({'status': 'success', 'message': message})

    except SpaceClassification.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '존재하지 않는 공간분류입니다.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': f'오류 발생: {str(e)}'}, status=500)


# connections/views.py 파일 맨 아래에 추가

@require_http_methods(["GET"])
def get_space_mapped_elements_api(request, project_id, sc_id):
    """특정 공간분류 ID(sc_id)에 맵핑된 RawElement 객체 목록을 반환합니다."""
    try:
        space = SpaceClassification.objects.get(id=sc_id, project_id=project_id)
        
        # 맵핑된 객체들의 ID 목록을 가져옵니다.
        element_ids_list = list(space.mapped_elements.values_list('id', flat=True))
        if not element_ids_list:
            return JsonResponse([], safe=False)

        # RawElement 객체들의 기본 정보를 조회합니다.
        elements_values = list(
            RawElement.objects.filter(id__in=element_ids_list)
            .values('id', 'element_unique_id', 'raw_data')
        )
        
        # 각 객체에 연결된 태그 정보를 조회합니다.
        tags_qs = (
            RawElement.classification_tags.through.objects
            .filter(rawelement_id__in=element_ids_list)
            .values('rawelement_id')
            .annotate(tag_name=F('quantityclassificationtag__name'))
            .values('rawelement_id', 'tag_name')
        )
        
        # 태그 정보를 객체 ID별로 정리합니다.
        tags_by_element_id = {}
        for tag_data in tags_qs:
            el_id = str(tag_data['rawelement_id']) # UUID를 문자열로 변환
            if el_id not in tags_by_element_id:
                tags_by_element_id[el_id] = []
            tags_by_element_id[el_id].append(tag_data['tag_name'])
            
        # 최종적으로 반환할 데이터 형식으로 가공합니다.
        for element_data in elements_values:
            element_id_str = str(element_data['id'])
            element_data['classification_tags'] = tags_by_element_id.get(element_id_str, [])
            element_data['id'] = element_id_str

        return JsonResponse(elements_values, safe=False)

    except SpaceClassification.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '해당 공간분류를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': f'오류 발생: {str(e)}'}, status=500)


# connections/views.py

# ... (기존의 모든 import 구문과 함수들은 그대로 둡니다) ...


# ▼▼▼ [추가] 파일 맨 아래에 아래 함수 블록 전체를 추가해주세요. ▼▼▼

@require_http_methods(["GET", "POST", "DELETE"])
def space_classification_rules_api(request, project_id, rule_id=None):
    """공간분류 생성 룰셋을 관리하는 API"""
    if request.method == 'GET':
        rules = SpaceClassificationRule.objects.filter(project_id=project_id)
        rules_data = [{
            'id': str(rule.id),
            'level_depth': rule.level_depth,
            'level_name': rule.level_name,
            'bim_object_filter': rule.bim_object_filter,
            'name_source_param': rule.name_source_param,
            'parent_join_param': rule.parent_join_param,
            'child_join_param': rule.child_join_param,
        } for rule in rules]
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        try:
            project = Project.objects.get(id=project_id)
            rule_id_from_data = data.get('id')
            
            # Django 2.2 이상에서는 update_or_create의 id 파라미터를 None으로 주면 create가 됩니다.
            # 혹시 모를 구버전 호환성을 위해 id가 'new' 또는 None일 경우를 처리합니다.
            if rule_id_from_data == 'new' or rule_id_from_data is None:
                rule_id_from_data = None
            
            rule, created = SpaceClassificationRule.objects.update_or_create(
                id=rule_id_from_data,
                project=project,
                defaults={
                    'level_depth': data.get('level_depth'),
                    'level_name': data.get('level_name'),
                    'bim_object_filter': data.get('bim_object_filter', {}),
                    'name_source_param': data.get('name_source_param'),
                    'parent_join_param': data.get('parent_join_param', ''),
                    'child_join_param': data.get('child_join_param', ''),
                }
            )
            return JsonResponse({'status': 'success', 'message': '공간분류 생성 규칙이 저장되었습니다.', 'rule_id': str(rule.id)})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        if not rule_id:
            return JsonResponse({'status': 'error', 'message': 'Rule ID가 필요합니다.'}, status=400)
        try:
            SpaceClassificationRule.objects.get(id=rule_id, project_id=project_id).delete()
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except SpaceClassificationRule.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)


@require_http_methods(["POST"])
def apply_space_classification_rules_view(request, project_id):
    """(최종 버전) 룰셋에 따라 공간분류 자동 생성/동기화 및 객체 자동 할당"""
    try:
        project = Project.objects.get(id=project_id)
        rules = SpaceClassificationRule.objects.filter(project=project).order_by('level_depth')
        elements = RawElement.objects.filter(project=project)
        
        if not rules.exists():
            return JsonResponse({'status': 'info', 'message': '적용할 공간분류 생성 규칙이 없습니다.'})

        created_count, updated_count = 0, 0
        processed_space_ids = set()

        # 각 레벨의 생성된 공간분류를 임시 저장할 딕셔너리
        spaces_by_level = {}

        for rule in rules:
            level = rule.level_depth
            spaces_by_level[level] = {}
            
            parent_level = level - 1
            parent_spaces_map = {}

            if level > 0 and parent_level in spaces_by_level:
                # 이전 레벨에서 생성된 공간분류들을 가져와 부모 맵을 만듭니다.
                for parent_space in spaces_by_level[parent_level].values():
                    parent_key = get_value_from_element(parent_space.source_element.raw_data, rule.parent_join_param)
                    if parent_key:
                        parent_spaces_map[parent_key] = parent_space
            
            matching_elements = [elem for elem in elements if evaluate_conditions(elem.raw_data, rule.bim_object_filter)]

            for element in matching_elements:
                parent_space = None
                if level > 0:
                    child_key_raw = get_value_from_element(element.raw_data, rule.child_join_param)
                    child_key_parsed = child_key_raw
                    
                    if isinstance(child_key_raw, str) and ': ' in child_key_raw:
                        try:
                            child_key_parsed = child_key_raw.split(': ', 1)[1]
                        except IndexError:
                            child_key_parsed = child_key_raw
                            
                    parent_space = parent_spaces_map.get(child_key_parsed)
                
                space_name = get_value_from_element(element.raw_data, rule.name_source_param) or "Unnamed Space"

                existing_space, created = SpaceClassification.objects.update_or_create(
                    project=project,
                    source_element=element,
                    defaults={'name': space_name, 'parent': parent_space}
                )
                
                # '객체 자동 할당' 로직
                existing_space.mapped_elements.set([element])

                # 현재 레벨에서 생성/업데이트된 공간분류를 다음 레벨에서 사용할 수 있도록 저장
                spaces_by_level[level][element.id] = existing_space

                if created:
                    created_count += 1
                elif existing_space.name != space_name or existing_space.parent != parent_space:
                    updated_count += 1
                
                processed_space_ids.add(existing_space.id)

        # 동기화 후, 더 이상 BIM 모델에 존재하지 않는 객체와 연결된 공간분류 삭제
        deletable_spaces = SpaceClassification.objects.filter(project=project, source_element__isnull=False).exclude(id__in=processed_space_ids)
        deleted_count, _ = deletable_spaces.delete()

        message = f"공간분류 동기화 완료: {created_count}개 생성, {updated_count}개 업데이트, {deleted_count}개 삭제되었습니다. (수동 추가 항목은 보존됨)"
        return JsonResponse({'status': 'success', 'message': message})

    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        import traceback
        return JsonResponse({'status': 'error', 'message': f'오류 발생: {str(e)}', 'details': traceback.format_exc()}, status=500)


# --- 1. ClassificationRule ---
@require_http_methods(["GET"])
def export_classification_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = ClassificationRule.objects.filter(project=project).select_related('target_tag')
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_classification_rules.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['priority', 'description', 'target_tag_name', 'conditions'])
    for rule in rules:
        writer.writerow([
            rule.priority,
            rule.description,
            rule.target_tag.name if rule.target_tag else '',
            json.dumps(rule.conditions)
        ])
    return response

@require_http_methods(["POST"])
def import_classification_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file:
        return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)

    try:
        ClassificationRule.objects.filter(project=project).delete()
        decoded_file = csv_file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)
        
        for row in reader:
            tag_name = row.get('target_tag_name')
            try:
                target_tag = QuantityClassificationTag.objects.get(project=project, name=tag_name)
                ClassificationRule.objects.create(
                    project=project,
                    priority=int(row.get('priority', 0)),
                    description=row.get('description', ''),
                    target_tag=target_tag,
                    conditions=json.loads(row.get('conditions', '[]'))
                )
            except QuantityClassificationTag.DoesNotExist:
                print(f"경고: '{tag_name}' 태그를 찾을 수 없어 해당 규칙을 건너뜁니다.")
                continue
        return JsonResponse({'status': 'success', 'message': '분류 할당 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- 2. PropertyMappingRule ---
@require_http_methods(["GET"])
def export_property_mapping_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = PropertyMappingRule.objects.filter(project=project).select_related('target_tag')
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_property_mapping_rules.csv"'
    writer = csv.writer(response)
    writer.writerow(['name', 'description', 'priority', 'target_tag_name', 'conditions', 'mapping_script'])
    for rule in rules:
        writer.writerow([
            rule.name, rule.description, rule.priority,
            rule.target_tag.name if rule.target_tag else '',
            json.dumps(rule.conditions), json.dumps(rule.mapping_script)
        ])
    return response

@require_http_methods(["POST"])
def import_property_mapping_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file: return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)
    try:
        PropertyMappingRule.objects.filter(project=project).delete()
        reader = csv.DictReader(csv_file.read().decode('utf-8').splitlines())
        for row in reader:
            try:
                target_tag = QuantityClassificationTag.objects.get(project=project, name=row.get('target_tag_name'))
                PropertyMappingRule.objects.create(
                    project=project, name=row.get('name'), description=row.get('description', ''),
                    priority=int(row.get('priority', 0)), target_tag=target_tag,
                    conditions=json.loads(row.get('conditions', '[]')),
                    mapping_script=json.loads(row.get('mapping_script', '{}'))
                )
            except QuantityClassificationTag.DoesNotExist: continue
        return JsonResponse({'status': 'success', 'message': '속성 맵핑 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e: return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- 3. CostCodeRule ---
@require_http_methods(["GET"])
def export_cost_code_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = CostCodeRule.objects.filter(project=project).select_related('target_cost_code')
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_cost_code_rules.csv"'
    writer = csv.writer(response)
    writer.writerow(['name', 'description', 'priority', 'target_cost_code_code', 'conditions', 'quantity_mapping_script'])
    for rule in rules:
        writer.writerow([
            rule.name, rule.description, rule.priority,
            rule.target_cost_code.code if rule.target_cost_code else '',
            json.dumps(rule.conditions), json.dumps(rule.quantity_mapping_script)
        ])
    return response

@require_http_methods(["POST"])
def import_cost_code_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file: return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)
    try:
        CostCodeRule.objects.filter(project=project).delete()
        reader = csv.DictReader(csv_file.read().decode('utf-8').splitlines())
        for row in reader:
            try:
                target_cost_code = CostCode.objects.get(project=project, code=row.get('target_cost_code_code'))
                CostCodeRule.objects.create(
                    project=project, name=row.get('name'), description=row.get('description', ''),
                    priority=int(row.get('priority', 0)), target_cost_code=target_cost_code,
                    conditions=json.loads(row.get('conditions', '[]')),
                    quantity_mapping_script=json.loads(row.get('quantity_mapping_script', '{}'))
                )
            except CostCode.DoesNotExist: continue
        return JsonResponse({'status': 'success', 'message': '공사코드 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e: return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- 4. MemberMarkAssignmentRule ---
@require_http_methods(["GET"])
def export_member_mark_assignment_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = MemberMarkAssignmentRule.objects.filter(project=project)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_member_mark_assignment_rules.csv"'
    writer = csv.writer(response)
    writer.writerow(['name', 'priority', 'conditions', 'mark_expression'])
    for rule in rules:
        writer.writerow([rule.name, rule.priority, json.dumps(rule.conditions), rule.mark_expression])
    return response

@require_http_methods(["POST"])
def import_member_mark_assignment_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file: return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)
    try:
        MemberMarkAssignmentRule.objects.filter(project=project).delete()
        reader = csv.DictReader(csv_file.read().decode('utf-8').splitlines())
        for row in reader:
            MemberMarkAssignmentRule.objects.create(
                project=project, name=row.get('name'), priority=int(row.get('priority', 0)),
                conditions=json.loads(row.get('conditions', '[]')),
                mark_expression=row.get('mark_expression', '')
            )
        return JsonResponse({'status': 'success', 'message': '일람부호 할당 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e: return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- 5. CostCodeAssignmentRule ---
@require_http_methods(["GET"])
def export_cost_code_assignment_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = CostCodeAssignmentRule.objects.filter(project=project)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_cost_code_assignment_rules.csv"'
    writer = csv.writer(response)
    writer.writerow(['name', 'priority', 'conditions', 'cost_code_expressions'])
    for rule in rules:
        writer.writerow([rule.name, rule.priority, json.dumps(rule.conditions), json.dumps(rule.cost_code_expressions)])
    return response

@require_http_methods(["POST"])
def import_cost_code_assignment_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file: return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)
    try:
        CostCodeAssignmentRule.objects.filter(project=project).delete()
        reader = csv.DictReader(csv_file.read().decode('utf-8').splitlines())
        for row in reader:
            CostCodeAssignmentRule.objects.create(
                project=project, name=row.get('name'), priority=int(row.get('priority', 0)),
                conditions=json.loads(row.get('conditions', '[]')),
                cost_code_expressions=json.loads(row.get('cost_code_expressions', '{}'))
            )
        return JsonResponse({'status': 'success', 'message': '공사코드 할당 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e: return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- 6. SpaceClassificationRule ---
@require_http_methods(["GET"])
def export_space_classification_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = SpaceClassificationRule.objects.filter(project=project)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_space_classification_rules.csv"'
    writer = csv.writer(response)
    writer.writerow(['level_depth', 'level_name', 'bim_object_filter', 'name_source_param', 'parent_join_param', 'child_join_param'])
    for rule in rules:
        writer.writerow([
            rule.level_depth, rule.level_name, json.dumps(rule.bim_object_filter),
            rule.name_source_param, rule.parent_join_param, rule.child_join_param
        ])
    return response

@require_http_methods(["POST"])
def import_space_classification_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file: return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)
    try:
        SpaceClassificationRule.objects.filter(project=project).delete()
        reader = csv.DictReader(csv_file.read().decode('utf-8').splitlines())
        for row in reader:
            SpaceClassificationRule.objects.create(
                project=project, level_depth=int(row.get('level_depth')), level_name=row.get('level_name'),
                bim_object_filter=json.loads(row.get('bim_object_filter', '{}')),
                name_source_param=row.get('name_source_param'),
                parent_join_param=row.get('parent_join_param', ''),
                child_join_param=row.get('child_join_param', '')
            )
        return JsonResponse({'status': 'success', 'message': '공간분류 생성 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e: return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- 7. SpaceAssignmentRule ---
@require_http_methods(["GET"])
def export_space_assignment_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    rules = SpaceAssignmentRule.objects.filter(project=project)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_space_assignment_rules.csv"'
    writer = csv.writer(response)
    writer.writerow(['name', 'priority', 'member_filter_conditions', 'member_join_property', 'space_join_property'])
    for rule in rules:
        writer.writerow([
            rule.name, rule.priority, json.dumps(rule.member_filter_conditions),
            rule.member_join_property, rule.space_join_property
        ])
    return response

@require_http_methods(["POST"])
def import_space_assignment_rules(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file: return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)
    try:
        SpaceAssignmentRule.objects.filter(project=project).delete()
        reader = csv.DictReader(csv_file.read().decode('utf-8').splitlines())
        for row in reader:
            SpaceAssignmentRule.objects.create(
                project=project, name=row.get('name'), priority=int(row.get('priority', 0)),
                member_filter_conditions=json.loads(row.get('member_filter_conditions', '[]')),
                member_join_property=row.get('member_join_property'),
                space_join_property=row.get('space_join_property')
            )
        return JsonResponse({'status': 'success', 'message': '공간분류 할당 룰셋을 성공적으로 가져왔습니다.'})
    except Exception as e: return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)
