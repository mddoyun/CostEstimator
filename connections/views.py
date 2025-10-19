# connections/views.py
import uuid #
from django.db.models import FloatField # FloatField 임포트 추가
from django.shortcuts import render, get_object_or_404 # get_object_or_404 추가
from django.http import JsonResponse, HttpResponse, FileResponse,Http404 # FileResponse 추가
from django.views.decorators.http import require_http_methods
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json
import csv
import re
from urllib.parse import quote as urlquote # Python 기본 라이브러리 사용
import os # 파일 처리 위해 추가
import base64 # 바이너리 데이터 인코딩/디코딩 위해 추가
from django.conf import settings # 임시 파일 경로 위해 추가
import tensorflow as tf # TensorFlow/Keras 임포트
from tensorflow import keras # Keras 임포트
import numpy as np # 데이터 처리 위해 NumPy 임포트
import pandas as pd # CSV 처리 위해 Pandas 임포트
from sklearn.model_selection import train_test_split # 데이터 분할 위해 추가
from sklearn.preprocessing import StandardScaler # 정규화 위해 추가
import threading # 백그라운드 학습 위해 추가
# ▼▼▼ [추가] AI 모델 임포트 ▼▼▼
from .models import AIModel
# ▲▲▲ [추가] 여기까지 ▲▲▲
from django.db.models import F, Sum, Count, Q
from functools import reduce
import operator
from .consumers import RevitConsumer, FrontendConsumer, serialize_specific_elements
from django.db import transaction
from django.core import serializers
import datetime
from decimal import Decimal, InvalidOperation # [추가] Decimal 임포트
import decimal # <--- decimal 임포트 추가
from django.db.models import Case, When, Value, IntegerField # [추가] Case, When 임포트
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
    UnitPriceType, # <--- 추가 확인
    UnitPrice      # <--- 추가 확인

)
from tensorflow.keras import models # <<< models 임포트 추가
# --- Project & Revit Data Views ---

def revit_control_panel(request):
    # 디버깅: 템플릿 렌더링 시작
    print("[DEBUG][revit_control_panel] Rendering revit_control.html")
    projects = Project.objects.all().order_by('-created_at')
    return render(request, 'revit_control.html', {'projects': projects})
def create_project(request):
    # 디버깅: 프로젝트 생성 요청 수신
    print("[DEBUG][create_project] Received request to create project")
    if request.method == 'POST':
        data = json.loads(request.body)
        project_name = data.get('name')
        if project_name:
            project = Project.objects.create(name=project_name)
            # 디버깅: 프로젝트 생성 성공
            print(f"[DEBUG][create_project] Project '{project.name}' created with ID: {project.id}")
            return JsonResponse({'status': 'success', 'project_id': str(project.id), 'project_name': project.name})
    # 디버깅: 잘못된 요청
    print("[ERROR][create_project] Invalid request method or missing name")
    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)

def trigger_revit_data_fetch(request, project_id):
    # 디버깅: 데이터 가져오기 명령 트리거
    print(f"[DEBUG][trigger_revit_data_fetch] Triggering data fetch for project ID: {project_id}")
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        # ▼▼▼ [수정] RevitConsumer의 그룹 이름 사용 ▼▼▼
        'revit_broadcast_group', # RevitConsumer.revit_group_name 대신 실제 그룹 이름 사용 (하드코딩 주의)
        # ▲▲▲ [수정] 여기까지 ▲▲▲
        {'type': 'send.command', 'command_data': {'command': 'fetch_all_elements', 'project_id': str(project_id)}}
    )
    return JsonResponse({'status': 'success', 'message': f'Fetch command sent for project {project_id}.'})
# --- Tag Import/Export Views ---

def export_tags(request, project_id):
    # 디버깅: 태그 내보내기 시작
    print(f"[DEBUG][export_tags] Exporting tags for project ID: {project_id}")
    project = Project.objects.get(id=project_id)
    tags = project.classification_tags.all().order_by('name')
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_tags.csv"'
    writer = csv.writer(response)
    writer.writerow(['name', 'description'])
    for tag in tags:
        writer.writerow([tag.name, tag.description])
    # 디버깅: 태그 내보내기 완료
    print(f"[DEBUG][export_tags] Exported {tags.count()} tags.")
    return response

def import_tags(request, project_id):
    # 디버깅: 태그 가져오기 요청 수신
    print(f"[DEBUG][import_tags] Importing tags for project ID: {project_id}")
    if request.method == 'POST' and request.FILES.get('tag_file'):
        project = Project.objects.get(id=project_id)
        tag_file = request.FILES['tag_file']
        try:
            # [수정] 삭제 전, 영향을 받을 모든 RawElement의 ID를 미리 가져옵니다.
            affected_element_ids = list(RawElement.objects.filter(
                project=project,
                classification_tags__isnull=False
            ).values_list('id', flat=True))
            # 디버깅: 영향 받는 객체 ID 확인
            print(f"[DEBUG][import_tags] Found {len(affected_element_ids)} potentially affected elements before deletion.")

            # 기존 태그를 모두 삭제합니다.
            deleted_count, _ = project.classification_tags.all().delete()
            # 디버깅: 기존 태그 삭제 확인
            print(f"[DEBUG][import_tags] Deleted {deleted_count} existing tags.")

            # 파일에서 새 태그를 읽어 생성합니다.
            decoded_file = tag_file.read().decode('utf-8').splitlines()
            reader = csv.reader(decoded_file)
            next(reader, None) # 헤더 건너뛰기
            created_count = 0
            for row in reader:
                if row:
                    name = row[0]
                    description = row[1] if len(row) > 1 else ""
                    QuantityClassificationTag.objects.create(project=project, name=name, description=description)
                    created_count += 1
            # 디버깅: 새 태그 생성 확인
            print(f"[DEBUG][import_tags] Created {created_count} new tags from CSV.")

            # [수정] 변경된 태그 목록과 영향을 받은 객체 정보를 프론트엔드로 전송합니다.
            channel_layer = get_channel_layer()

            # 1. 업데이트된 태그 목록 전송
            tags = [{'id': str(tag.id), 'name': tag.name} for tag in project.classification_tags.all()]
            async_to_sync(channel_layer.group_send)(
                FrontendConsumer.frontend_group_name,
                {'type': 'broadcast_tags', 'tags': tags}
            )
            # 디버깅: 태그 목록 브로드캐스트
            print(f"[DEBUG][import_tags] Broadcasted updated tag list ({len(tags)} tags).")

            # 2. 영향을 받은 객체가 있었다면, 최신 상태를 전송
            if affected_element_ids:
                # async 함수를 sync 컨텍스트에서 호출하기 위해 async_to_sync 사용
                updated_elements_data = async_to_sync(serialize_specific_elements)(affected_element_ids)
                if updated_elements_data:
                    async_to_sync(channel_layer.group_send)(
                        FrontendConsumer.frontend_group_name,
                        {'type': 'broadcast_elements', 'elements': updated_elements_data}
                    )
                    # 디버깅: 영향 받은 객체 정보 브로드캐스트
                    print(f"[DEBUG][import_tags] Broadcasted updates for {len(updated_elements_data)} affected elements.")

            return JsonResponse({'status': 'success'})
        except Exception as e:
            # 디버깅: 오류 발생
            print(f"[ERROR][import_tags] Error during import: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
    # 디버깅: 잘못된 요청
    print("[ERROR][import_tags] Invalid request method or missing file.")
    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)





# --- Classification Ruleset API ---

@require_http_methods(["GET", "POST", "DELETE"])
def classification_rules_api(request, project_id, rule_id=None):
    # 디버깅: API 요청 수신
    print(f"[DEBUG][classification_rules_api] Method: {request.method}, Project: {project_id}, Rule: {rule_id}")
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
        # 디버깅: 조회 결과
        print(f"[DEBUG][classification_rules_api] GET: Found {len(rules_data)} rules.")
        return JsonResponse(rules_data, safe=False)

    elif request.method == 'POST':
        data = json.loads(request.body)
        # 디버깅: POST 데이터 확인
        print(f"[DEBUG][classification_rules_api] POST data: {data}")
        try:
            project = Project.objects.get(id=project_id)
            target_tag = QuantityClassificationTag.objects.get(id=data.get('target_tag_id'), project=project)
            rule_id_from_data = data.get('id')
            if rule_id_from_data and rule_id_from_data != 'new': # 'new' 문자열 처리 추가
                # 디버깅: 규칙 수정
                print(f"[DEBUG][classification_rules_api] Updating rule ID: {rule_id_from_data}")
                rule = ClassificationRule.objects.get(id=rule_id_from_data, project=project)
            else:
                # 디버깅: 새 규칙 생성
                print("[DEBUG][classification_rules_api] Creating new rule.")
                rule = ClassificationRule(project=project)
            rule.target_tag = target_tag
            rule.conditions = data.get('conditions', [])
            rule.priority = data.get('priority', 0)
            rule.description = data.get('description', '')
            rule.save()
            # 디버깅: 저장 성공
            print(f"[DEBUG][classification_rules_api] Rule saved successfully. ID: {rule.id}")
            return JsonResponse({'status': 'success', 'message': '규칙이 저장되었습니다.', 'rule_id': rule.id})
        except (Project.DoesNotExist, QuantityClassificationTag.DoesNotExist, ClassificationRule.DoesNotExist) as e:
            # 디버깅: 관련 객체 못 찾음
            print(f"[ERROR][classification_rules_api] POST Error - Not Found: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=404)
        except Exception as e:
            # 디버깅: 기타 저장 오류
            print(f"[ERROR][classification_rules_api] POST Error - Exception: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    elif request.method == 'DELETE':
        if not rule_id:
            # 디버깅: Rule ID 누락
            print("[ERROR][classification_rules_api] DELETE Error: Rule ID is required.")
            return JsonResponse({'status': 'error', 'message': 'Rule ID가 필요합니다.'}, status=400)
        try:
            # 디버깅: 규칙 삭제 시도
            print(f"[DEBUG][classification_rules_api] Attempting to delete rule ID: {rule_id}")
            rule = ClassificationRule.objects.get(id=rule_id, project_id=project_id)
            rule.delete()
            # 디버깅: 삭제 성공
            print(f"[DEBUG][classification_rules_api] Rule ID: {rule_id} deleted successfully.")
            return JsonResponse({'status': 'success', 'message': '규칙이 삭제되었습니다.'})
        except ClassificationRule.DoesNotExist:
            # 디버깅: 삭제할 규칙 못 찾음
            print(f"[ERROR][classification_rules_api] DELETE Error: Rule ID {rule_id} not found.")
            return JsonResponse({'status': 'error', 'message': '규칙을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            # 디버깅: 기타 삭제 오류
            print(f"[ERROR][classification_rules_api] DELETE Error - Exception: {e}")
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
    점(.)이 포함된 키를 해석하여 중첩된 객체의 값을 찾아옵니다.
    'Parameters', 'TypeParameters' 등 다양한 위치를 모두 확인합니다.
    """
    if not raw_data or not parameter_name:
        return None

    # 1. 점(.)을 기준으로 키를 분리합니다.
    parts = parameter_name.split('.')
    
    # 2. 검색을 시작할 초기 객체를 설정합니다.
    # 만약 첫 번째 키가 'Parameters'나 'TypeParameters'가 아니라면,
    # raw_data의 최상위, Parameters, TypeParameters 순서로 모두 탐색합니다.
    potential_starts = []
    if parts[0] in raw_data:
        potential_starts.append(raw_data)
    if 'Parameters' in raw_data:
        potential_starts.append(raw_data['Parameters'])
    if 'TypeParameters' in raw_data:
        potential_starts.append(raw_data['TypeParameters'])
    
    # 만약 탐색 시작점을 찾지 못하면, raw_data 자체를 시작점으로 삼습니다.
    if not potential_starts:
        potential_starts.append(raw_data)

    # 3. 각 잠재적 시작 위치에서 값을 탐색합니다.
    for start_obj in potential_starts:
        current_obj = start_obj
        found = True
        for part in parts:
            if isinstance(current_obj, dict) and part in current_obj:
                current_obj = current_obj[part]
            else:
                found = False
                break
        
        # 값을 성공적으로 찾았다면 즉시 반환합니다.
        if found:
            return current_obj
            
    # 모든 위치에서 값을 찾지 못한 경우
    return None

def is_numeric(value):
    if value is None: return False
    try: float(value); return True
    except (ValueError, TypeError): return False
# 기존의 evaluate_conditions 함수를 찾아서 아래 코드로 교체해주세요.

def evaluate_conditions(data_dict, conditions):
    """
    주어진 데이터 딕셔너리가 모든 조건을 만족하는지 평가합니다.
    [수정됨] data_dict에서 직접 키를 찾고, 없으면 get_value_from_element를 사용합니다.
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

        # ▼▼▼ [핵심 수정] 값 찾는 로직 개선 ▼▼▼
        actual_value = None
        # 1. 먼저 data_dict에서 직접 키를 찾아봅니다 (예: 'classification_tag_name').
        if p in data_dict:
            actual_value = data_dict.get(p)
        # 2. 직접 키가 없으면, 중첩된 구조(raw_data)를 탐색하는 기존 함수를 호출합니다.
        else:
            actual_value = get_value_from_element(data_dict, p)
        # ▲▲▲ [핵심 수정] 여기까지 입니다. ▲▲▲
            
        actual_v_str = str(actual_value or "")

        result = False # 결과 변수 초기화
        if o == 'equals': result = (actual_v_str == str(v))
        elif o == 'not_equals': result = (actual_v_str != str(v))
        elif o == 'contains': result = (str(v) in actual_v_str)
        elif o == 'not_contains': result = (str(v) not in actual_v_str)
        elif o == 'starts_with': result = (actual_v_str.startswith(str(v)))
        elif o == 'ends_with': result = (actual_v_str.endswith(str(v)))
        
        # 숫자 비교 연산자
        elif o in ['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal']:
            if is_numeric(actual_value) and is_numeric(v):
                actual_num, v_num = float(actual_value), float(v)
                if o == 'greater_than': result = (actual_num > v_num)
                elif o == 'less_than': result = (actual_num < v_num)
                elif o == 'greater_or_equal': result = (actual_num >= v_num)
                elif o == 'less_or_equal': result = (actual_num <= v_num)
        
        # 존재 여부 확인
        elif o == 'exists': result = (actual_value is not None)
        elif o == 'not_exists': result = (actual_value is None)

        # ▼▼▼ [디버깅 추가] 조건 평가 결과 출력 ▼▼▼
        # print(f"    - 조건 평가: '{p}' ({o}) '{v}' | 실제값: '{actual_v_str}' -> 결과: {result}")
        # ▲▲▲ 위 코드는 너무 많은 로그를 유발할 수 있으므로, 필요 시에만 주석을 해제하여 사용하세요.

        return result

    return False

@require_http_methods(["POST"])
def apply_classification_rules_view(request, project_id):
    print("\n[DEBUG] --- '룰셋 일괄적용' API 요청 수신 ---")
    try:
        project = Project.objects.get(id=project_id)
        rules = ClassificationRule.objects.filter(project=project).order_by('priority').select_related('target_tag')
        elements = RawElement.objects.filter(project=project).prefetch_related('classification_tags')

        if not rules.exists():
            print("[DEBUG] 적용할 룰셋이 없어 조기 종료합니다.")
            return JsonResponse({'status': 'info', 'message': '적용할 규칙이 없습니다. 먼저 룰셋을 정의해주세요.'})

        print(f"[DEBUG] {elements.count()}개의 BIM 객체에 대해 {rules.count()}개의 룰셋 적용을 시작합니다.")
        
        project_tags = {tag.name: tag for tag in QuantityClassificationTag.objects.filter(project=project)}
        updated_count = 0
        element_process_count = 0

        for element in elements:
            element_process_count += 1
            # print(f"\n[DEBUG] ({element_process_count}/{elements.count()}) 객체 처리 중: UniqueId = {element.element_unique_id}") # 상세 디버깅 필요시 주석 해제

            current_tag_names = {tag.name for tag in element.classification_tags.all()}
            
            tags_to_add = set()
            for rule in rules:
                # print(f"  - 룰 검사: '{rule.description or rule.target_tag.name}' (Priority: {rule.priority})") # 상세 디버깅 필요시 주석 해제
                if evaluate_conditions(element.raw_data, rule.conditions):
                    tags_to_add.add(rule.target_tag.name)
                    print(f"  [HIT!] 객체 '{element.raw_data.get('Name', element.element_unique_id)}'가 룰 '{rule.description or rule.target_tag.name}'에 일치하여 '{rule.target_tag.name}' 태그가 추가됩니다.")
            
            if not tags_to_add.issubset(current_tag_names):
                final_names = current_tag_names.union(tags_to_add)
                final_objects = [project_tags[name] for name in final_names if name in project_tags]
                element.classification_tags.set(final_objects)
                updated_count += 1
        
        print(f"[DEBUG] 총 {updated_count}개의 객체 분류 정보가 업데이트되었습니다.")
        message = f'룰셋을 적용하여 총 {updated_count}개 객체의 분류를 업데이트했습니다.' if updated_count > 0 else '모든 객체가 이미 룰셋의 조건과 일치하여, 변경된 사항이 없습니다.'
        return JsonResponse({'status': 'success', 'message': message})
    except Project.DoesNotExist:
        print(f"[ERROR] 프로젝트 ID '{project_id}'를 찾을 수 없습니다.")
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        print(f"[ERROR] 룰셋 적용 중 예외 발생: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'status': 'error', 'message': f'오류 발생: {str(e)}'}, status=500)
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
            'ai_sd_enabled': code.ai_sd_enabled,
            'dd_enabled': code.dd_enabled,
        } for code in codes]
        return JsonResponse(codes_data, safe=False)

    # --- POST: 새 공사코드 생성 ---
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            project = Project.objects.get(id=project_id)
            ai_sd = bool(data.get('ai_sd_enabled', False))
            dd    = bool(data.get('dd_enabled', False))
            print(f"[COSTCODE/POST] project={project_id} payload={data} "f"=> ai_sd_enabled={ai_sd}, dd_enabled={dd}")
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
                description=data.get('description', ''),
                # [ADD] 새 필드 저장
                ai_sd_enabled=ai_sd,
                dd_enabled=dd,
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
                        
            # [ADD] 새 불린 필드 적용 (키가 오면만 반영)
            if 'ai_sd_enabled' in data:
                cost_code.ai_sd_enabled = bool(data['ai_sd_enabled'])
            if 'dd_enabled' in data:
                cost_code.dd_enabled = bool(data['dd_enabled'])

            # [ADD] 디버깅 로그
            print(f"[COSTCODE/PUT] project={project_id} id={code_id} payload={data} "
                f"=> ai_sd_enabled={cost_code.ai_sd_enabled}, dd_enabled={cost_code.dd_enabled}")


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
    print("\n[DEBUG] --- '자동생성(분류기준)' 실행 시작 ---") #<-- 디버깅 로그 추가
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

        print(f"[DEBUG] {elements.count()}개의 BIM 객체 처리 시작...") #<-- 디버깅 로그 추가
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
        
        # ▼▼▼ [추가] 삭제될 부재가 있을 경우 로그를 출력하는 부분을 추가합니다. ▼▼▼
        deletable_count = deletable_members.count()
        if deletable_count > 0:
            print(f"[DEBUG] 유효하지 않은 QuantityMember {deletable_count}개를 삭제합니다.")
            print(f"  > 삭제 대상 ID (일부): {list(deletable_members.values_list('id', flat=True)[:5])}")
        else:
            print("[DEBUG] 유효하지 않아 삭제할 QuantityMember가 없습니다.")
        # ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

        deleted_count, _ = deletable_members.delete()

        message = (f'룰셋/개별 맵핑식을 적용하여 {created_count}개의 부재를 새로 생성하고, '
                   f'{updated_count}개를 업데이트했습니다. '
                   f'유효하지 않은 부재 {deleted_count}개를 삭제했습니다.')
        
        print(f"[DEBUG] --- '자동생성(분류기준)' 실행 완료 ---") #<-- 디버깅 로그 추가
        return JsonResponse({'status': 'success', 'message': message})

    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[ERROR] 자동 생성 중 오류 발생: {str(e)}") #<-- 디버깅 로그 추가
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
    """
    (개선된 버전)
    CostItem의 수량 계산식을 평가합니다.
    - [MarkProperty]: MemberMark.properties (일람부호 속성)
    - {{RawProperty}}: RawElement.raw_data (BIM 원본 숫자만 추출)
    - {Property}: QuantityMember.properties (부재 속성) 또는 RawElement.raw_data (BIM 원본 속성)
    """
    if not isinstance(expression, str) or not quantity_member:
        return expression

    temp_expression = expression
    
    # 1단계: [MemberMark 속성] 처리 - 대괄호 []
    mark_placeholders = re.findall(r'\[([^\]]+)\]', temp_expression)
    if mark_placeholders:
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

    # (공통) 검색할 데이터 소스 준비
    raw_data = quantity_member.raw_element.raw_data if quantity_member.raw_element else {}
    member_props = quantity_member.properties if quantity_member.properties else {}

    # 2단계: {{RawElement 숫자 속성}} 처리 - 이중 중괄호 {{}}
    # (이것을 { } 보다 먼저 처리해야 함)
    numeric_placeholders = re.findall(r'\{\{([^}]+)\}\}', temp_expression)
    for placeholder in set(numeric_placeholders):
        # {{...}}는 RawElement의 숫자 값만 추출하는 것으로 가정
        value = get_value_from_element(raw_data, placeholder)
        
        if value is not None:
            match = re.match(r'^\s*(-?\d+(\.\d+)?)\s*', str(value))
            if match:
                numeric_value = match.group(1)
                temp_expression = temp_expression.replace(f'{{{{{placeholder}}}}}', str(numeric_value))
            else:
                temp_expression = temp_expression.replace(f'{{{{{placeholder}}}}}', '0')
        else:
            temp_expression = temp_expression.replace(f'{{{{{placeholder}}}}}', '0')

    # 3단계: {QuantityMember 또는 RawElement 속성} 처리 - 중괄호 {}
    member_placeholders = re.findall(r'\{([^}]+)\}', temp_expression)
    if member_placeholders:
        for placeholder in set(member_placeholders):
            value = None
            
            # 1순위: QuantityMember.properties에서 찾기 (예: '체적')
            if placeholder in member_props:
                value = member_props.get(placeholder)
            # 2순위: RawElement.raw_data에서 찾기 (예: 'Volume')
            else:
                value = get_value_from_element(raw_data, placeholder)

            if value is not None:
                replacement = str(value) if is_numeric(value) else f'"{str(value)}"'
                temp_expression = temp_expression.replace(f'{{{placeholder}}}', replacement)
            else:
                # 해당 속성이 없으면 0으로 처리하여 계산 오류 방지
                temp_expression = temp_expression.replace(f'{{{placeholder}}}', '0')

    # 4단계: 최종 문자열 계산
    if not temp_expression.strip(): return ""
    try:
        safe_dict = {'__builtins__': {'abs': abs, 'round': round, 'max': max, 'min': min, 'len': len}}
        return eval(temp_expression, safe_dict)
    except Exception as e:
        return f"Error: Failed to evaluate '{expression}' -> '{temp_expression}' ({str(e)})"

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
        # select_related를 통해 target_cost_code 객체 전체를 미리 불러옵니다.
        rules = CostCodeRule.objects.filter(project=project).order_by('priority').select_related('target_cost_code')

        members = QuantityMember.objects.filter(
            project=project
        ).select_related(
            'member_mark',
            'raw_element',
            'classification_tag'
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
        
        # ▼▼▼ [디버깅] 룰셋 자동 생성 시작 로그 ▼▼▼
        print("\n[DEBUG] --- '자동생성(공사코드기준)' 실행 시작 ---")
        print(f"[DEBUG] {members.count()}개의 QuantityMembers를 처리합니다.")
        # ▲▲▲ [디버깅] --- ▲▲▲
        
        all_cost_codes_in_project = {cc.id: cc for cc in CostCode.objects.filter(project=project)}

        for member in members:
            # ▼▼▼ [디버깅] 현재 멤버의 '체적'과 '태그' 값을 확인합니다. ▼▼▼
            member_chejeok = member.properties.get('체적') if member.properties else '속성 없음'
            member_tag_name = member.classification_tag.name if member.classification_tag else '태그 없음'
            print(f"\n[DEBUG] 멤버 처리 중: {member.name} (ID: {member.id})")
            print(f"  > '체적' 속성 값: {member_chejeok}")
            print(f"  > '태그' 이름: {member_tag_name}")
            # ▲▲▲ [디버깅] --- ▲▲▲

            combined_properties = member.properties.copy() if member.properties else {}

            if member.member_mark and member.member_mark.properties:
                for key, value in member.member_mark.properties.items():
                    combined_properties[f'일람부호.{key}'] = value

            if member.raw_element and member.raw_element.raw_data:
                raw_data = member.raw_element.raw_data
                for key, value in raw_data.items():
                    if not isinstance(value, (dict, list)):
                        combined_properties[f'BIM원본.{key}'] = value
                for key, value in raw_data.get('TypeParameters', {}).items():
                    combined_properties[f'BIM원본.{key}'] = value
                for key, value in raw_data.get('Parameters', {}).items():
                    combined_properties[f'BIM원본.{key}'] = value

            if member.classification_tag:
                combined_properties['classification_tag_name'] = member.classification_tag.name
            if member.member_mark:
                combined_properties['member_mark_name'] = member.member_mark.mark
            
            cost_codes_on_member = member.cost_codes.all()
            if not cost_codes_on_member:
                print("  > [DEBUG] 이 멤버에 할당된 공사코드가 없어 건너뜁니다.")
                continue

            for cost_code in cost_codes_on_member:
                # ▼▼▼ [디버깅] 현재 공사코드 ID/Code 출력 ▼▼▼
                print(f"  > [DEBUG] 공사코드 '{cost_code.code}' (ID: {cost_code.id}) 처리 중...")
                # ▲▲▲ [디버깅] ▲▲▲
                
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
                    print(f"    > [DEBUG] CostItem의 개별 맵핑식을 사용합니다.")
                else:
                    print(f"    > [DEBUG] 룰셋 {rules.count()}개를 순회합니다...")
                    for rule in rules:
                        # ▼▼▼ [디버깅] 현재 룰의 ID와 타겟 ID/Code 출력 ▼▼▼
                        print(f"      > [DEBUG] 검사 중인 룰 ID: {rule.id}, 타겟 Code: {rule.target_cost_code.code}")
                        # ▲▲▲ [디버깅] ▲▲▲

                        # ▼▼▼ [핵심 수정] ID 비교 대신 Code 문자열 비교로 변경 ▼▼▼
                        code_match = rule.target_cost_code.code == cost_code.code
                        condition_met = evaluate_conditions(combined_properties, rule.conditions)
                        
                        # ▼▼▼ [디버깅] Code 비교 결과와 조건 평가 결과 출력 ▼▼▼
                        print(f"        > [DEBUG] Code 일치? {code_match} (룰 타겟: '{rule.target_cost_code.code}' vs 멤버 코드: '{cost_code.code}')")
                        print(f"        > [DEBUG] 조건 만족? {condition_met}")
                        # ▲▲▲ [디버깅] ▲▲▲

                        if code_match and condition_met:
                            script_to_use = rule.quantity_mapping_script
                            break # 일치하는 룰을 찾았으므로 더 이상 순회하지 않음
                        
                        elif code_match and not condition_met:
                            print(f"        > [DEBUG] 룰 ID {rule.id}을(를) 찾았으나, 조건 불일치.")

                final_qty = 0.0
                if script_to_use:
                    # ▼▼▼ [디버깅] 룰 매칭 및 계산 결과 출력 ▼▼▼
                    print(f"    > [DEBUG] 공사코드 '{cost_code.code}': 룰 매칭 성공! (script: {script_to_use})")
                    qty_script = script_to_use.get('수량', 0)
                    print(f"    > [DEBUG]   -> qty_script: {qty_script}")
                    
                    calculated_qty = evaluate_expression_for_cost_item(qty_script, member)
                    print(f"    > [DEBUG]   -> calculated_qty: {calculated_qty} (Type: {type(calculated_qty)})")
                    
                    final_qty = float(calculated_qty) if is_numeric(calculated_qty) else 0.0
                    print(f"    > [DEBUG]   -> final_qty: {final_qty}")
                    # ▲▲▲ [디버깅] ▲▲▲
                elif not item.quantity_mapping_expression:
                     print(f"    > [DEBUG] 공사코드 '{cost_code.code}': 일치하는 룰이 없습니다.")
                
                if item.quantity != final_qty or created:
                    item.quantity = final_qty
                    item.save(update_fields=['quantity'])

                valid_item_ids.add(item.id)

        # ▼▼▼ [디버깅] ▼▼▼
        print("\n[DEBUG] --- '자동생성(공사코드기준)' 실행 종료 ---")
        # ▲▲▲ [디버깅] ▲▲▲

        deletable_items = CostItem.objects.filter(project=project, quantity_member__isnull=False).exclude(id__in=valid_item_ids)
        deleted_count, _ = deletable_items.delete()

        message = f'룰셋/개별 맵핑식을 적용하여 {created_count}개 항목 생성, {updated_count}개 업데이트, {deleted_count}개 삭제했습니다.'
        return JsonResponse({'status': 'success', 'message': message})

    except Project.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        import traceback
        return JsonResponse({'status': 'error', 'message': f'자동 생성 중 오류 발생: {str(e)}', 'details': traceback.format_exc()}, status=500)

def evaluate_member_properties_expression(expression, context_data):
    """
    '{Name}' 또는 '{BIM원본.Category}'와 같은 표현식을 주어진 데이터 컨텍스트에서 평가합니다.
    [수정됨] QuantityMember.properties 뿐만 아니라, combined_properties 전체를 사용합니다.
    """
    if not isinstance(expression, str):
        return expression
    
    print(f"  [DEBUG] 표현식 평가 시작: '{expression}'")

    temp_expression = expression
    placeholders = re.findall(r'\{([^}]+)\}', temp_expression)
    
    for placeholder in set(placeholders):
        # [핵심 수정] context_data (combined_properties)에서 직접 값을 찾습니다.
        value = context_data.get(placeholder)
        
        print(f"    > 플레이스홀더: '{{{placeholder}}}', 찾은 값: '{value}' (타입: {type(value).__name__})")
        
        if value is not None:
            # 값이 숫자인지 확인하고, 문자열이면 따옴표로 감싸줍니다.
            replacement = str(value) if is_numeric(value) else f'"{str(value)}"'
            temp_expression = temp_expression.replace(f'{{{placeholder}}}', replacement)
        else:
            # 해당 속성이 없으면 빈 문자열로 처리하여 문자열 조합에 사용될 수 있도록 함
            # 예: "{층}F" -> "F"가 아닌 ""가 되도록
            temp_expression = temp_expression.replace(f'{{{placeholder}}}', '""')
            print(f"    > 경고: context_data에서 '{placeholder}' 키를 찾을 수 없습니다. 빈 문자열로 처리합니다.")
            
    try:
        # eval의 위험성을 줄이기 위해 사용 가능한 내장 함수를 제한합니다.
        safe_dict = {'__builtins__': {'abs': abs, 'round': round, 'max': max, 'min': min, 'len': len, 'str': str, 'int': int, 'float': float}}
        
        print(f"    > 최종 평가식: '{temp_expression}'")
        evaluated_result = eval(temp_expression, safe_dict)
        print(f"    > 평가 결과: '{evaluated_result}'")
        
        return evaluated_result
    except Exception as e:
        # eval 실패 시, 단순 문자열 조합 결과일 수 있으므로 temp_expression을 그대로 반환
        print(f"    > eval() 오류 발생: {e}. 표현식을 문자열 조합으로 간주하고 결과를 반환합니다.")
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
    print("\n[DEBUG] --- '할당 룰셋 일괄적용' API 요청 수신 ---")
    try:
        project = Project.objects.get(id=project_id)
        
        members = list(QuantityMember.objects.filter(project=project).select_related('raw_element', 'member_mark', 'classification_tag').prefetch_related('cost_codes', 'space_classifications'))
        
        mark_rules = list(MemberMarkAssignmentRule.objects.filter(project=project).order_by('priority'))
        cost_code_rules = list(CostCodeAssignmentRule.objects.filter(project=project).order_by('priority'))
        dynamic_space_rules = list(SpaceAssignmentRule.objects.filter(project=project).order_by('priority'))

        print(f"[DEBUG] {len(members)}개의 수량산출부재에 대해 룰셋 적용을 시작합니다.")
        print(f"  > 적용할 일람부호 룰셋: {len(mark_rules)}개")
        print(f"  > 적용할 공사코드 룰셋: {len(cost_code_rules)}개")
        print(f"  > 적용할 동적 공간 룰셋: {len(dynamic_space_rules)}개")

        updated_mark_count = 0
        updated_cost_code_count = 0
        updated_space_count = 0

        for member in members:
            print(f"\n[DEBUG] 부재 처리 중: '{member.name}' (ID: {member.id})")
            
            # 1-1. 모든 속성을 종합한 'combined_properties' 딕셔너리 생성
            combined_properties = member.properties.copy() if member.properties else {}
            
            # [핵심] QuantityMember 모델의 직접적인 속성도 추가 (예: Name)
            combined_properties['Name'] = member.name
            
            if member.raw_element and member.raw_element.raw_data:
                raw_data = member.raw_element.raw_data
                for k, v in raw_data.items():
                    if not isinstance(v, (dict, list)): combined_properties[f'BIM원본.{k}'] = v
                for k, v in raw_data.get('TypeParameters', {}).items(): combined_properties[f'BIM원본.TypeParameters.{k}'] = v
                for k, v in raw_data.get('Parameters', {}).items(): combined_properties[f'BIM원본.Parameters.{k}'] = v
            
            if member.classification_tag:
                combined_properties['classification_tag_name'] = member.classification_tag.name
            if member.member_mark:
                combined_properties['member_mark_name'] = member.member_mark.mark

            # --- 2. 일람부호 할당 로직 ---
            print("[DEBUG] --- 일람부호 할당 룰셋 적용 시작 ---")
            mark_expr = member.member_mark_expression
            if mark_expr:
                 print(f"  [DEBUG] 부재에 개별 할당된 Mark 표현식 '{mark_expr}'을(를) 사용합니다.")
            else:
                print(f"  [DEBUG] {len(mark_rules)}개의 일람부호 룰셋을 순차적으로 검사합니다.")
                for rule in mark_rules:
                    print(f"  [DEBUG] >> 규칙 검사: '{rule.name}' (Priority: {rule.priority})")
                    if evaluate_conditions(combined_properties, rule.conditions):
                        mark_expr = rule.mark_expression
                        print(f"  [DEBUG] >> 조건 일치! Mark 표현식 '{mark_expr}'을(를) 사용합니다.")
                        break
                    else:
                        print(f"  [DEBUG] >> 조건 불일치.")
            
            if mark_expr:
                # [핵심 수정] combined_properties를 전달
                evaluated_mark_value = evaluate_member_properties_expression(mark_expr, combined_properties)
                print(f"  [DEBUG] 최종 평가된 Mark 값: '{evaluated_mark_value}'")
                
                if evaluated_mark_value and str(evaluated_mark_value).strip():
                    # get_or_create로 일람부호가 없으면 생성, 있으면 가져옴
                    mark_obj, created = MemberMark.objects.get_or_create(
                        project=project, 
                        mark=str(evaluated_mark_value), 
                        defaults={'description': '룰셋에 의해 자동 생성됨'}
                    )
                    
                    if created:
                        print(f"  [DEBUG] >> 새로운 일람부호 '{mark_obj.mark}'을(를) 생성했습니다.")
                    else:
                        print(f"  [DEBUG] >> 기존 일람부호 '{mark_obj.mark}'을(를) 찾았습니다.")

                    if member.member_mark != mark_obj:
                        member.member_mark = mark_obj
                        member.save(update_fields=['member_mark'])
                        updated_mark_count += 1
                        print(f"  [DEBUG] >> 부재 '{member.name}'에 일람부호 '{mark_obj.mark}'을(를) 할당했습니다.")
                    else:
                        print(f"  [DEBUG] >> 이미 올바른 일람부호가 할당되어 있어 변경하지 않습니다.")
                else:
                    print(f"  [DEBUG] Mark 표현식의 평가 결과가 비어있어 할당을 건너뜁니다.")
            else:
                 print("  [DEBUG] 이 부재에 일치하는 일람부호 할당 규칙이 없습니다.")

            # --- 3. 공사코드 할당 로직 (기존 로직과 동일, 디버깅 프린트 추가) ---
            print("[DEBUG] --- 공사코드 할당 룰셋 적용 시작 ---")
            cost_code_exprs_list = member.cost_code_expressions
            if cost_code_exprs_list:
                print(f"  [DEBUG] 부재에 개별 할당된 공사코드 표현식을 사용합니다.")
            else:
                matching_expressions = []
                for rule in cost_code_rules:
                    if evaluate_conditions(combined_properties, rule.conditions):
                        matching_expressions.append(rule.cost_code_expressions)
                cost_code_exprs_list = matching_expressions
            
            if cost_code_exprs_list:
                codes_changed = False
                current_codes_before = set(member.cost_codes.all())
                
                for expr_set in cost_code_exprs_list:
                    if not isinstance(expr_set, dict): continue

                    code_val = evaluate_member_properties_expression(expr_set.get('code', ''), combined_properties)
                    name_val = evaluate_member_properties_expression(expr_set.get('name', ''), combined_properties)
                    if code_val and name_val:
                        code_obj, created = CostCode.objects.get_or_create(project=project, code=str(code_val), defaults={'name': str(name_val), 'description': '룰셋에 의해 자동 생성됨'})
                        if code_obj not in current_codes_before:
                            codes_changed = True
                        member.cost_codes.add(code_obj)
                        print(f"  [DEBUG] >> 공사코드 '{code_obj.code}' 할당/생성 완료.")

                if codes_changed:
                    updated_cost_code_count += 1
        
        # --- 4. 동적 공간분류 할당 로직 (기존 로직과 동일) ---
        print("[DEBUG] --- 동적 공간분류 할당 룰셋 적용 시작 ---")
        if dynamic_space_rules:
            all_spaces = list(SpaceClassification.objects.filter(project=project).select_related('source_element'))
            temp_updated_space_count = 0

            for rule in dynamic_space_rules:
                members_map = {}
                for member_for_space in members:
                    member_combined_properties = member_for_space.properties.copy() if member_for_space.properties else {}
                    if member_for_space.raw_element and member_for_space.raw_element.raw_data:
                        raw_data = member_for_space.raw_element.raw_data
                        for k, v in raw_data.items():
                            if not isinstance(v, (dict, list)): member_combined_properties[f'BIM원본.{k}'] = v
                        for k, v in raw_data.get('TypeParameters', {}).items(): member_combined_properties[f'BIM원본.{k}'] = v
                        for k, v in raw_data.get('Parameters', {}).items(): member_combined_properties[f'BIM원본.{k}'] = v
                    if member_for_space.classification_tag:
                        member_combined_properties['classification_tag_name'] = member_for_space.classification_tag.name

                    if rule.member_filter_conditions and not evaluate_conditions(member_combined_properties, rule.member_filter_conditions):
                        continue
                    
                    join_key = get_property_value(member_for_space, rule.member_join_property, 'member')
                    if join_key is not None:
                        join_key_str = str(join_key)
                        if join_key_str not in members_map: members_map[join_key_str] = []
                        members_map[join_key_str].append(member_for_space)

                spaces_map = {}
                for space in all_spaces:
                    join_key = get_property_value(space, rule.space_join_property, 'space')
                    if join_key is not None:
                        spaces_map[str(join_key)] = space
                
                for key, member_list in members_map.items():
                    if key in spaces_map:
                        space_to_assign = spaces_map[key]
                        for member_to_assign in member_list:
                            if space_to_assign not in member_to_assign.space_classifications.all():
                                member_to_assign.space_classifications.add(space_to_assign)
                                temp_updated_space_count += 1
            if temp_updated_space_count > 0:
                updated_space_count = QuantityMember.objects.filter(project=project, space_classifications__isnull=False).distinct().count()

        message = f'룰셋 적용 완료! 일람부호 {updated_mark_count}개, 공사코드 {updated_cost_code_count}개, 공간분류 {updated_space_count}개 부재가 업데이트되었습니다.'
        print(f"[DEBUG] --- 최종 결과: {message} ---")
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

@require_http_methods(["GET"])
def generate_boq_report_api(request, project_id):
    """(개선된 버전 + 비용 계산 추가) 사용자가 요청한 모든 종류의 그룹핑/표시 기준 및 필터에 따라 CostItem을 집계하고 비용을 계산합니다."""
    print(f"\n[DEBUG] --- '집계표 생성(generate_boq_report_api)' API 요청 수신 (Project ID: {project_id}) ---")
    print(f"[DEBUG] Raw GET parameters: {request.GET}")

    group_by_fields = request.GET.getlist('group_by')
    display_by_fields = request.GET.getlist('display_by')
    raw_element_ids = request.GET.getlist('raw_element_ids')
    filter_ai = request.GET.get('filter_ai', 'true').lower() == 'true'
    filter_dd = request.GET.get('filter_dd', 'true').lower() == 'true'

    print(f"[DEBUG] Parsed Parameters:")
    print(f"  - group_by: {group_by_fields}")
    print(f"  - display_by: {display_by_fields}")
    print(f"  - raw_element_ids: {raw_element_ids}")
    print(f"  - filter_ai: {filter_ai}")
    print(f"  - filter_dd: {filter_dd}")

    if not group_by_fields:
        print("[ERROR] 그룹핑 기준이 선택되지 않았습니다.")
        return JsonResponse({'status': 'error', 'message': '하나 이상의 그룹핑 기준을 선택해야 합니다.'}, status=400)

    # --- 1. 필드 유형 분리 ---

    direct_fields = set(['id', 'quantity', 'cost_code_id', 'unit_price_type_id', 'cost_code__name', 'quantity_member_id'])    
    json_fields = set()
    all_requested_fields = set(group_by_fields + display_by_fields)

    for field in all_requested_fields:
        if '__properties__' in field or '__raw_data__' in field:
            json_fields.add(field)
        elif field not in direct_fields: # 이미 direct_fields에 있는건 제외
            direct_fields.add(field)

    # --- 2. DB에서 필요한 모든 데이터를 한 번에 조회 ---
    values_to_fetch = list(direct_fields)
    if any('__properties__' in f for f in json_fields):
        values_to_fetch.extend(['quantity_member__properties', 'quantity_member__member_mark__properties'])
    if any('__raw_data__' in f for f in json_fields):
        values_to_fetch.append('quantity_member__raw_element__raw_data')

    items_qs = CostItem.objects.filter(project_id=project_id)
    print(f"[DEBUG] 초기 CostItem QuerySet count: {items_qs.count()}")

    # Revit 선택 필터링
    if raw_element_ids:
        items_qs = items_qs.filter(quantity_member__raw_element_id__in=raw_element_ids)
        print(f"[DEBUG] Revit ID 필터링 후 count: {items_qs.count()}")

    # AI / DD 필터링
    q_filter = Q()
    if filter_ai and filter_dd: q_filter = Q(cost_code__ai_sd_enabled=True) | Q(cost_code__dd_enabled=True)
    elif filter_ai: q_filter = Q(cost_code__ai_sd_enabled=True)
    elif filter_dd: q_filter = Q(cost_code__dd_enabled=True)
    else: q_filter = Q(pk__isnull=True) # 둘 다 False면 아무것도 선택 안 함

    items_qs = items_qs.filter(q_filter)
    print(f"[DEBUG] AI/DD 필터링 후 count: {items_qs.count()}")

    # 최종적으로 필요한 값들만 조회
    items_from_db = list(items_qs.select_related(
        'cost_code', 'unit_price_type', 'quantity_member__classification_tag',
        'quantity_member__member_mark', 'quantity_member__raw_element'
    ).values(*set(values_to_fetch))) # values() 에 quantity_member_id 포함됨
    print(f"[DEBUG] 최종 DB 조회할 데이터 count: {len(items_from_db)}")

    # --- 2.5 단가 데이터 미리 로드 ---
    print("[DEBUG] 단가 데이터 로딩 시작...")
    unit_prices_qs = UnitPrice.objects.filter(project_id=project_id)
    # 키: (cost_code_id, unit_price_type_id), 값: UnitPrice 객체 (Decimal 필드 포함)
    unit_prices_map = {
        (str(up.cost_code_id), str(up.unit_price_type_id)): up
        for up in unit_prices_qs
    }
    print(f"[DEBUG] {len(unit_prices_map)}개의 단가 정보 로드 완료.")

    # --- 3. Python에서 JSON 필드 값 파싱 및 비용 계산 ---
    ZERO_DECIMAL = Decimal('0.0000') # 비용 계산용 상수

    def get_value_from_path(item, path):
        # ... (이 함수는 기존 코드와 동일) ...
        if '__properties__' in path:
            parts = path.split('__properties__')
            base_path, key = parts[0], parts[1]
            prop_dict = item.get(f'{base_path}__properties')
            return prop_dict.get(key) if isinstance(prop_dict, dict) else None

        if '__raw_data__' in path:
            raw_data_dict = item.get('quantity_member__raw_element__raw_data')
            if not isinstance(raw_data_dict, dict): return None
            key_path = path.split('__raw_data__')[1].strip('_').split('__')
            current = raw_data_dict
            for part in key_path:
                if isinstance(current, dict):
                    current = current.get(part)
                else:
                    return None
            return current

        # 'cost_code__name' 같은 직접 필드는 이미 item 딕셔너리에 있어야 함
        return item.get(path)


    items = []
    print("[DEBUG] 데이터 재가공 및 비용 계산 시작...")
    processed_count = 0
    for db_item in items_from_db:
        processed_item = {}

        # 요청된 필드 값 추출 (JSON 포함)
        for field in all_requested_fields:
            processed_item[field] = get_value_from_path(db_item, field)

        # 기본 정보 복사
        processed_item['id'] = db_item['id']
        processed_item['quantity'] = Decimal(str(db_item.get('quantity', 0.0) or 0.0)) # Float -> Decimal로 변환
        processed_item['cost_code_name'] = db_item.get('cost_code__name') # DB에서 가져온 값 사용
        qm_id = db_item.get('quantity_member_id')
        processed_item['quantity_member_id'] = str(qm_id) if qm_id else None
        # [핵심] 비용 계산 로직
        cost_code_id = str(db_item.get('cost_code_id'))
        unit_price_type_id = str(db_item.get('unit_price_type_id')) if db_item.get('unit_price_type_id') else None
        processed_item['unit_price_type_id'] = db_item.get('unit_price_type_id') # 원본 UUID 저장 (프론트엔드용)

        unit_price_obj = None
        has_missing_price = False

        if unit_price_type_id:
            lookup_key = (cost_code_id, unit_price_type_id)
            unit_price_obj = unit_prices_map.get(lookup_key)
            if unit_price_obj is None:
                has_missing_price = True
                if processed_count < 10: # 너무 많은 로그 방지
                     print(f"  [WARN] CostItem ID {db_item['id']}: UnitPrice not found for CostCode {cost_code_id} and Type {unit_price_type_id}. Costs will be 0.")

        # 단가 및 금액 계산 (Decimal 사용)
        qty = processed_item['quantity']
        mat_unit = unit_price_obj.material_cost if unit_price_obj else ZERO_DECIMAL
        lab_unit = unit_price_obj.labor_cost if unit_price_obj else ZERO_DECIMAL
        exp_unit = unit_price_obj.expense_cost if unit_price_obj else ZERO_DECIMAL
        tot_unit = unit_price_obj.total_cost if unit_price_obj else ZERO_DECIMAL

        processed_item['material_cost_unit'] = mat_unit
        processed_item['labor_cost_unit'] = lab_unit
        processed_item['expense_cost_unit'] = exp_unit
        processed_item['total_cost_unit'] = tot_unit

        processed_item['material_cost_total'] = mat_unit * qty
        processed_item['labor_cost_total'] = lab_unit * qty
        processed_item['expense_cost_total'] = exp_unit * qty
        processed_item['total_cost_total'] = tot_unit * qty

        processed_item['has_missing_price'] = has_missing_price

        items.append(processed_item)
        processed_count += 1
        if processed_count % 1000 == 0:
             print(f"  ... processed {processed_count} items")

    print(f"[DEBUG] 파싱 및 비용 계산 완료. 총 {len(items)}개 항목.")

    # --- 4. 데이터 집계 로직 (비용 필드 합산 추가) ---
    print("[DEBUG] 데이터 집계 시작...")
    root = {
        'name': 'Total',
        'quantity': ZERO_DECIMAL, # Decimal로 초기화
        'count': 0,
        'children': {},
        'display_values': {},
        'item_ids': [],
        # 비용 합계 필드 추가
        'material_cost_unit': ZERO_DECIMAL, 'material_cost_total': ZERO_DECIMAL,
        'labor_cost_unit': ZERO_DECIMAL, 'labor_cost_total': ZERO_DECIMAL,
        'expense_cost_unit': ZERO_DECIMAL, 'expense_cost_total': ZERO_DECIMAL,
        'total_cost_unit': ZERO_DECIMAL, 'total_cost_total': ZERO_DECIMAL,
        'unit_price_type_ids': set(), # 그룹 내 단가 기준 ID 추적
        'has_missing_price_in_group': False # 그룹 내 누락된 단가 여부
    }
    VARIOUS_VALUES_SENTINEL = object()
    VARIOUS_UNIT_PRICE_TYPES = 'various' # 단가 기준이 다양할 때 사용할 값

    for item in items:
        # 루트 노드에 합계 누적 (여기서는 quantity와 total_cost_total만 예시로)
        root['quantity'] += item['quantity']
        root['total_cost_total'] += item['total_cost_total']
        root['item_ids'].append(item['id'])
        # [추가] 루트 노드에도 단가 기준 ID와 누락 여부 추적
        if item['unit_price_type_id']:
            root['unit_price_type_ids'].add(item['unit_price_type_id'])
        if item['has_missing_price']:
            root['has_missing_price_in_group'] = True

        current_level = root

        for i, field in enumerate(group_by_fields):
            key = item.get(field)
            # JSON 필드 값은 문자열화하여 키로 사용 (딕셔너리 등 비교 방지)
            if isinstance(key, (dict, list)):
                key_str = json.dumps(key, sort_keys=True)
            else:
                key_str = str(key) if key is not None else '(값 없음)'

            if key_str not in current_level['children']:
                current_level['children'][key_str] = {
                    'name': key_str, 'quantity': ZERO_DECIMAL, 'count': 0, 'level': i,
                    'children': {}, 'display_values': {}, 'item_ids': [],
                    # 비용 필드 초기화
                    'material_cost_unit': ZERO_DECIMAL, 'material_cost_total': ZERO_DECIMAL,
                    'labor_cost_unit': ZERO_DECIMAL, 'labor_cost_total': ZERO_DECIMAL,
                    'expense_cost_unit': ZERO_DECIMAL, 'expense_cost_total': ZERO_DECIMAL,
                    'total_cost_unit': ZERO_DECIMAL, 'total_cost_total': ZERO_DECIMAL,
                    'unit_price_type_ids': set(),
                    'has_missing_price_in_group': False
                }

            child_node = current_level['children'][key_str]
            current_level = child_node # 다음 레벨로 이동

            # 현재 레벨 노드에 값 누적
            current_level['quantity'] += item['quantity']
            current_level['count'] += 1
            current_level['item_ids'].append(item['id'])

            # 비용 누적
            current_level['material_cost_total'] += item['material_cost_total']
            current_level['labor_cost_total'] += item['labor_cost_total']
            current_level['expense_cost_total'] += item['expense_cost_total']
            current_level['total_cost_total'] += item['total_cost_total']

            # [추가] 단가 기준 ID 및 누락 여부 추적
            if item['unit_price_type_id']:
                current_level['unit_price_type_ids'].add(item['unit_price_type_id'])
            if item['has_missing_price']:
                current_level['has_missing_price_in_group'] = True

            # Display 필드 값 처리
            for display_field in display_by_fields:
                current_value = item.get(display_field)
                if display_field not in current_level['display_values']:
                    current_level['display_values'][display_field] = current_value
                elif current_level['display_values'][display_field] != current_value and \
                     current_level['display_values'][display_field] is not VARIOUS_VALUES_SENTINEL:
                    current_level['display_values'][display_field] = VARIOUS_VALUES_SENTINEL

    print("[DEBUG] 데이터 집계 완료.")

    # --- 5. 최종 결과 포맷팅 (재귀 함수 + 비용 필드 추가) ---
    print("[DEBUG] 최종 결과 포맷팅 시작...")
    # Decimal을 문자열로 변환하기 위한 헬퍼
    def decimal_to_str(d):
        return str(d.quantize(Decimal("0.0001"))) # 소수점 4자리까지

    def format_to_list(node):
        children_list = []
        # 그룹 키(name) 기준으로 정렬
        for key, child_node in sorted(node['children'].items()):
            final_display_values = {}
            for field in display_by_fields:
                value = child_node['display_values'].get(field)
                frontend_key = field.replace('__', '_') # 프론트엔드 호환 키
                # JSON 객체나 리스트면 문자열로 변환
                if isinstance(value, (dict, list)):
                    value_str = json.dumps(value, ensure_ascii=False)
                else:
                    value_str = value if value is not None else ''

                final_display_values[frontend_key] = '<다양함>' if value is VARIOUS_VALUES_SENTINEL else value_str

            # 그룹 노드의 평균 단가 계산 (total_cost / quantity)
            # 0으로 나누는 경우 방지
            avg_mat_unit = (child_node['material_cost_total'] / child_node['quantity']) if child_node['quantity'] else ZERO_DECIMAL
            avg_lab_unit = (child_node['labor_cost_total'] / child_node['quantity']) if child_node['quantity'] else ZERO_DECIMAL
            avg_exp_unit = (child_node['expense_cost_total'] / child_node['quantity']) if child_node['quantity'] else ZERO_DECIMAL
            avg_tot_unit = (child_node['total_cost_total'] / child_node['quantity']) if child_node['quantity'] else ZERO_DECIMAL

            # 그룹 내 단가 기준 상태 결정
            unit_price_type_id_result = None
            if len(child_node['unit_price_type_ids']) == 1:
                unit_price_type_id_result = list(child_node['unit_price_type_ids'])[0]
            elif len(child_node['unit_price_type_ids']) > 1:
                unit_price_type_id_result = VARIOUS_UNIT_PRICE_TYPES

            child_list_item = {
                'name': child_node['name'],
                'quantity': decimal_to_str(child_node['quantity']), # Decimal -> str
                'count': child_node['count'],
                'level': child_node['level'],
                'display_values': final_display_values,
                'children': format_to_list(child_node), # 재귀 호출
                'item_ids': child_node['item_ids'],
                # 비용 필드 추가 (Decimal -> str 변환)
                'material_cost_unit': decimal_to_str(avg_mat_unit),
                'material_cost_total': decimal_to_str(child_node['material_cost_total']),
                'labor_cost_unit': decimal_to_str(avg_lab_unit),
                'labor_cost_total': decimal_to_str(child_node['labor_cost_total']),
                'expense_cost_unit': decimal_to_str(avg_exp_unit),
                'expense_cost_total': decimal_to_str(child_node['expense_cost_total']),
                'total_cost_unit': decimal_to_str(avg_tot_unit),
                'total_cost_total': decimal_to_str(child_node['total_cost_total']),
                # 단가 기준 상태 및 누락 여부 추가
                'unit_price_type_id': unit_price_type_id_result, # UUID, VARIOUS_UNIT_PRICE_TYPES, 또는 None
                'has_missing_price': child_node['has_missing_price_in_group']
            }
            children_list.append(child_list_item)
        return children_list

    report_data = format_to_list(root)

    # 전체 합계 계산 (Decimal 사용)
    total_summary_costs = {
        'total_material_cost': ZERO_DECIMAL,
        'total_labor_cost': ZERO_DECIMAL,
        'total_expense_cost': ZERO_DECIMAL,
        'total_total_cost': ZERO_DECIMAL,
    }
    for item in items: # 집계 전 원본 item 리스트 순회
        total_summary_costs['total_material_cost'] += item['material_cost_total']
        total_summary_costs['total_labor_cost'] += item['labor_cost_total']
        total_summary_costs['total_expense_cost'] += item['expense_cost_total']
        total_summary_costs['total_total_cost'] += item['total_cost_total']

    total_summary = {
        # [핵심 수정] sum() 함수에 start=ZERO_DECIMAL 추가
        'total_quantity': decimal_to_str(sum((item['quantity'] for item in items), start=ZERO_DECIMAL)),
        'total_count': len(items),
        # 비용 합계 추가 (Decimal -> str)
        'total_material_cost': decimal_to_str(total_summary_costs['total_material_cost']),
        'total_labor_cost': decimal_to_str(total_summary_costs['total_labor_cost']),
        'total_expense_cost': decimal_to_str(total_summary_costs['total_expense_cost']),
        'total_total_cost': decimal_to_str(total_summary_costs['total_total_cost']),
    }

    print("[DEBUG] 최종 결과 포맷팅 완료.")
    print("[DEBUG] --- '집계표 생성' 완료. JSON 응답을 반환합니다. ---")

    # 모든 단가 타입 정보도 함께 전달 (프론트엔드 드롭다운 채우기용)
    unit_price_types = list(UnitPriceType.objects.filter(project_id=project_id).values('id', 'name'))
    # UUID를 문자열로 변환
    for upt in unit_price_types:
        upt['id'] = str(upt['id'])
    print("[DEBUG] 개별 항목 데이터(items)의 Decimal 필드를 문자열로 변환 시작...")
    cost_fields_to_convert = [
        'material_cost_unit', 'material_cost_total',
        'labor_cost_unit', 'labor_cost_total',
        'expense_cost_unit', 'expense_cost_total',
        'total_cost_unit', 'total_cost_total',
        'quantity'
    ]
    for item in items:
        # 'cost_code_name'은 이미 문자열이므로 변환 대상 아님
        for field in cost_fields_to_convert:
            if field in item and isinstance(item[field], Decimal):
                item[field] = decimal_to_str(item[field])
            elif field == 'quantity' and isinstance(item.get(field), Decimal):
                 item[field] = decimal_to_str(item[field])
    print("[DEBUG] 개별 항목 데이터 문자열 변환 완료.")

    return JsonResponse({
        'report': report_data,
        'summary': total_summary,
        'unit_price_types': unit_price_types,
        'items_detail': items # quantity_member_id 포함됨
    }, safe=False)
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


# --- CostCode (공사코드) ---
@require_http_methods(["GET"])
def export_cost_codes(request, project_id):
    project = Project.objects.get(id=project_id)
    codes = CostCode.objects.filter(project=project)
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_cost_codes.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['code', 'name', 'spec', 'unit', 'category', 'description'])
    for code in codes:
        writer.writerow([
            code.code, code.name, code.spec, code.unit, code.category, code.description
        ])
    return response

@require_http_methods(["POST"])
def import_cost_codes(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file:
        return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)

    try:
        # 기존 데이터를 모두 삭제 (덮어쓰기 방식)
        CostCode.objects.filter(project=project).delete()
        
        decoded_file = csv_file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)
        
        codes_to_create = []
        for row in reader:
            codes_to_create.append(CostCode(
                project=project,
                code=row.get('code'),
                name=row.get('name'),
                spec=row.get('spec', ''),
                unit=row.get('unit', ''),
                category=row.get('category', ''),
                description=row.get('description', '')
            ))
        
        CostCode.objects.bulk_create(codes_to_create)
        
        return JsonResponse({'status': 'success', 'message': '공사코드 데이터를 성공적으로 가져왔습니다.'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)

# --- MemberMark (일람부호) ---
@require_http_methods(["GET"])
def export_member_marks(request, project_id):
    project = Project.objects.get(id=project_id)
    marks = MemberMark.objects.filter(project=project)
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_member_marks.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['mark', 'description', 'properties'])
    for mark in marks:
        writer.writerow([
            mark.mark, mark.description, json.dumps(mark.properties, ensure_ascii=False)
        ])
    return response

@require_http_methods(["POST"])
def import_member_marks(request, project_id):
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file:
        return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)

    try:
        MemberMark.objects.filter(project=project).delete()
        
        decoded_file = csv_file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)
        
        marks_to_create = []
        for row in reader:
            try:
                properties = json.loads(row.get('properties', '{}'))
            except json.JSONDecodeError:
                properties = {} # JSON 형식이 잘못되었을 경우 빈 객체로 처리

            marks_to_create.append(MemberMark(
                project=project,
                mark=row.get('mark'),
                description=row.get('description', ''),
                properties=properties
            ))
            
        MemberMark.objects.bulk_create(marks_to_create)
        
        return JsonResponse({'status': 'success', 'message': '일람부호 데이터를 성공적으로 가져왔습니다.'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)


@require_http_methods(["GET"])
def export_space_classifications(request, project_id):
    """프로젝트의 모든 공간분류 데이터를 CSV로 내보냅니다."""
    project = Project.objects.get(id=project_id)
    spaces = SpaceClassification.objects.filter(project=project).select_related('source_element').prefetch_related('mapped_elements')
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{project.name}_space_classifications.csv"'
    
    writer = csv.writer(response)
    # CSV 헤더: mapped_elements는 '|'로 구분된 UniqueID 목록으로 저장
    writer.writerow(['id', 'name', 'description', 'parent_id', 'source_element_unique_id', 'mapped_elements_unique_ids'])
    
    for space in spaces:
        source_element_uid = space.source_element.element_unique_id if space.source_element else ''
        mapped_elements_uids = "|".join([elem.element_unique_id for elem in space.mapped_elements.all()])
        
        writer.writerow([
            space.id,
            space.name,
            space.description,
            space.parent_id if space.parent_id else '',
            source_element_uid,
            mapped_elements_uids
        ])
    return response
@require_http_methods(["POST"])
def import_space_classifications(request, project_id):
    """(수정된 버전) CSV 파일을 읽어 새로운 ID를 부여하며 공간분류를 생성하고 관계를 설정합니다."""
    project = Project.objects.get(id=project_id)
    csv_file = request.FILES.get('csv_file')
    if not csv_file:
        return JsonResponse({'status': 'error', 'message': 'CSV 파일이 필요합니다.'}, status=400)

    try:
        decoded_file = csv_file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)
        csv_data = list(reader)

        # 성능 향상을 위해 필요한 데이터를 미리 메모리에 로드
        raw_elements_map = {elem.element_unique_id: elem for elem in RawElement.objects.filter(project=project)}
        
        # CSV의 옛날 ID와 새로 생성된 Space 객체를 매핑할 딕셔너리
        id_map = {}
        created_count = 0

        # 1차 처리: CSV의 ID는 무시하고, 새로운 ID로 객체를 생성합니다. (부모 관계는 아직 설정 안 함)
        for row in csv_data:
            old_id = row.get('id')
            if not old_id: continue

            source_element_uid = row.get('source_element_unique_id')
            source_element = raw_elements_map.get(source_element_uid)

            new_space = SpaceClassification.objects.create(
                project=project,
                name=row.get('name'),
                description=row.get('description', ''),
                source_element=source_element
            )
            created_count += 1
            id_map[old_id] = new_space # 옛날 ID를 키로, 새로 생성된 객체를 값으로 저장

        # 2차 처리: 생성된 객체들을 기반으로 부모-자식 관계 및 M2M 관계를 설정합니다.
        for row in csv_data:
            old_id = row.get('id')
            old_parent_id = row.get('parent_id')
            
            # id_map에서 새로 생성된 현재 객체와 부모 객체를 찾습니다.
            current_space = id_map.get(old_id)
            parent_space = id_map.get(old_parent_id) if old_parent_id else None

            if not current_space: continue

            # 부모 관계 설정
            if parent_space and current_space.parent != parent_space:
                current_space.parent = parent_space
                current_space.save(update_fields=['parent'])

            # Mapped Elements (M2M) 관계 설정
            mapped_uids_str = row.get('mapped_elements_unique_ids', '')
            if mapped_uids_str:
                mapped_uids = mapped_uids_str.split('|')
                elements_to_map = [raw_elements_map[uid] for uid in mapped_uids if uid in raw_elements_map]
                current_space.mapped_elements.set(elements_to_map)
            else:
                current_space.mapped_elements.clear()

        return JsonResponse({
            'status': 'success', 
            'message': f'공간분류 가져오기 완료: {created_count}개 생성'
        })
    except Exception as e:
        import traceback
        return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}', 'details': traceback.format_exc()}, status=400)
# connections/views.py 파일 맨 아래에 추가

import datetime
from django.db import transaction
from django.core import serializers

# ▼▼▼ [추가] 이 함수 블록 전체를 파일 맨 아래에 추가해주세요. ▼▼▼

@require_http_methods(["GET"])
def export_project(request, project_id):
    """
    프로젝트와 관련된 모든 데이터를 직렬화하여 단일 JSON 파일로 내보냅니다.
    """
    print(f"\n[DEBUG] --- 프로젝트 내보내기 시작 (Project ID: {project_id}) ---")
    try:
        project = Project.objects.get(id=project_id)
        
        # 직렬화할 모델과 쿼리셋을 정의합니다.
        models_to_serialize = {
            'Project': Project.objects.filter(id=project_id),
            'QuantityClassificationTag': QuantityClassificationTag.objects.filter(project=project),
            'CostCode': CostCode.objects.filter(project=project),
            'MemberMark': MemberMark.objects.filter(project=project),
            'RawElement': RawElement.objects.filter(project=project),
            'SpaceClassification': SpaceClassification.objects.filter(project=project),
            'ClassificationRule': ClassificationRule.objects.filter(project=project),
            'PropertyMappingRule': PropertyMappingRule.objects.filter(project=project),
            'CostCodeRule': CostCodeRule.objects.filter(project=project),
            'MemberMarkAssignmentRule': MemberMarkAssignmentRule.objects.filter(project=project),
            'CostCodeAssignmentRule': CostCodeAssignmentRule.objects.filter(project=project),
            'SpaceClassificationRule': SpaceClassificationRule.objects.filter(project=project),
            'SpaceAssignmentRule': SpaceAssignmentRule.objects.filter(project=project),
            'QuantityMember': QuantityMember.objects.filter(project=project),
            'CostItem': CostItem.objects.filter(project=project),
        }

        export_data = {}
        
        # 각 모델의 데이터를 직렬화합니다.
        for name, qs in models_to_serialize.items():
            print(f"[DEBUG] '{name}' 모델 데이터 직렬화 중... ({qs.count()}개)")
            # 'python' 포맷으로 직렬화하여 나중에 JSON으로 쉽게 변환할 수 있도록 합니다.
            export_data[name] = serializers.serialize('python', qs)

        # ManyToMany 관계 데이터를 수동으로 추출합니다.
        print("[DEBUG] ManyToMany 관계 데이터 추출 중...")
        export_data['M2M_RawElement_classification_tags'] = list(RawElement.classification_tags.through.objects.filter(rawelement__project=project).values('rawelement_id', 'quantityclassificationtag_id'))
        export_data['M2M_RawElement_space_classifications'] = list(RawElement.space_classifications.through.objects.filter(rawelement__project=project).values('rawelement_id', 'spaceclassification_id'))
        export_data['M2M_QuantityMember_cost_codes'] = list(QuantityMember.cost_codes.through.objects.filter(quantitymember__project=project).values('quantitymember_id', 'costcode_id'))
        export_data['M2M_QuantityMember_space_classifications'] = list(QuantityMember.space_classifications.through.objects.filter(quantitymember__project=project).values('quantitymember_id', 'spaceclassification_id'))
        
        # JSON 응답 생성
        response = HttpResponse(
            json.dumps(export_data, indent=2, cls=serializers.json.DjangoJSONEncoder),
            content_type='application/json'
        )
        
        # 파일 이름 설정
        filename = f"{project.name}_{datetime.date.today()}.json"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        print(f"[DEBUG] --- 프로젝트 내보내기 완료: {filename} ---")
        return response

    except Project.DoesNotExist:
        print(f"[ERROR] 내보낼 프로젝트를 찾을 수 없습니다 (ID: {project_id}).")
        return JsonResponse({'status': 'error', 'message': 'Project not found.'}, status=404)
    except Exception as e:
        print(f"[ERROR] 프로젝트 내보내기 중 예외 발생: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@require_http_methods(["POST"])
@transaction.atomic
def import_project(request):
    """
    [수정됨] 업로드된 JSON 파일을 분석하여 새로운 프로젝트와 관련 데이터를 생성합니다.
    - Many-to-Many 관계를 안전하게 처리하기 위해 .set() 메소드를 사용합니다.
    - 전체 프로세스는 트랜잭션으로 처리됩니다.
    """
    print("\n[DEBUG] --- 프로젝트 가져오기 시작 ---")
    if not request.FILES.get('project_file'):
        return JsonResponse({'status': 'error', 'message': '프로젝트 파일이 필요합니다.'}, status=400)

    try:
        project_file = request.FILES['project_file']
        import_data = json.load(project_file)

        # 이전 ID와 새로 생성된 객체를 매핑하기 위한 딕셔너리
        pk_map = {}

        # 1. 프로젝트 생성
        print("[DEBUG] 1. 프로젝트 생성 중...")
        project_data = import_data.get('Project', [])[0]['fields']
        old_project_pk = import_data.get('Project', [])[0]['pk']
        new_project_name = f"{project_data['name']} (Imported {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')})"
        new_project = Project.objects.create(name=new_project_name, description=project_data.get('description', ''))
        pk_map[old_project_pk] = new_project
        print(f"[DEBUG]   - 새 프로젝트 '{new_project_name}' 생성 완료.")

        # 2. ForeignKey가 없는 단순 모델부터 순차적으로 생성
        simple_models = ['QuantityClassificationTag', 'CostCode', 'MemberMark']
        print(f"[DEBUG] 2. 단순 모델({', '.join(simple_models)}) 데이터 가져오기 중...")
        for model_name in simple_models:
            for data in import_data.get(model_name, []):
                old_pk = data['pk']
                fields = data['fields']
                fields['project'] = new_project
                ModelClass = globals()[model_name]
                new_obj = ModelClass.objects.create(**fields)
                pk_map[old_pk] = new_obj
        print(f"[DEBUG]   - 단순 모델 생성 완료.")

        # 3. RawElement 생성 (M2M 필드 처리 포함)
        print("[DEBUG] 3. RawElement 데이터 가져오기 중...")
        raw_element_m2m_data = []
        for data in import_data.get('RawElement', []):
            old_pk = data['pk']
            fields = data['fields']
            fields['project'] = new_project
            
            # M2M 필드 데이터를 분리하고 나중에 처리하기 위해 저장합니다.
            m2m_fields = {}
            if 'classification_tags' in fields:
                m2m_fields['classification_tags'] = fields.pop('classification_tags')
            if 'space_classifications' in fields:
                m2m_fields['space_classifications'] = fields.pop('space_classifications')

            new_obj = RawElement.objects.create(**fields)
            pk_map[old_pk] = new_obj
            raw_element_m2m_data.append({'new_obj': new_obj, 'm2m_fields': m2m_fields})
        print(f"[DEBUG]   - RawElement 객체 생성 완료.")

        # 4. SpaceClassification 생성 (부모 및 M2M 관계 때문에 여러 단계로 처리)
        print("[DEBUG] 4. SpaceClassification 데이터 가져오기 중...")
        space_parent_map = {}
        space_m2m_data = []
        for data in import_data.get('SpaceClassification', []):
            old_pk = data['pk']
            fields = data['fields']
            fields['project'] = new_project
            
            if fields.get('source_element'):
                fields['source_element'] = pk_map.get(fields['source_element'])

            old_parent_pk = fields.pop('parent', None)
            
            # M2M 필드(mapped_elements) 분리
            m2m_fields = {}
            if 'mapped_elements' in fields:
                m2m_fields['mapped_elements'] = fields.pop('mapped_elements')

            new_obj = SpaceClassification.objects.create(**fields)
            pk_map[old_pk] = new_obj
            
            if old_parent_pk:
                space_parent_map[new_obj.id] = old_parent_pk
            if m2m_fields:
                space_m2m_data.append({'new_obj': new_obj, 'm2m_fields': m2m_fields})

        # SpaceClassification 부모 관계 설정
        for space_id, old_parent_pk in space_parent_map.items():
            parent_obj = pk_map.get(old_parent_pk)
            if parent_obj:
                SpaceClassification.objects.filter(id=space_id).update(parent=parent_obj)
        print(f"[DEBUG]   - SpaceClassification 생성 및 부모 관계 설정 완료.")

        # 5. 모든 Rule 모델 생성
        rule_models = [
            'ClassificationRule', 'PropertyMappingRule', 'CostCodeRule', 
            'MemberMarkAssignmentRule', 'CostCodeAssignmentRule', 
            'SpaceClassificationRule', 'SpaceAssignmentRule'
        ]
        print(f"[DEBUG] 5. 룰셋 모델({', '.join(rule_models)}) 데이터 가져오기 중...")
        for model_name in rule_models:
            for data in import_data.get(model_name, []):
                old_pk = data['pk']
                fields = data['fields']
                fields['project'] = new_project
                
                for fk_field in ['target_tag', 'target_cost_code']:
                    if fk_field in fields and fields[fk_field]:
                        fields[fk_field] = pk_map.get(fields[fk_field])

                ModelClass = globals()[model_name]
                new_obj = ModelClass.objects.create(**fields)
                pk_map[old_pk] = new_obj
        print(f"[DEBUG]   - 룰셋 모델 생성 완료.")

        # 6. QuantityMember 생성 (M2M 필드 처리 포함)
        print("[DEBUG] 6. QuantityMember 데이터 가져오기 중...")
        quantity_member_m2m_data = []
        for data in import_data.get('QuantityMember', []):
            old_pk = data['pk']
            fields = data['fields']
            fields['project'] = new_project
            for fk_field in ['raw_element', 'classification_tag', 'member_mark']:
                if fields.get(fk_field):
                    fields[fk_field] = pk_map.get(fields[fk_field])
            
            m2m_fields = {}
            if 'cost_codes' in fields:
                m2m_fields['cost_codes'] = fields.pop('cost_codes')
            if 'space_classifications' in fields:
                m2m_fields['space_classifications'] = fields.pop('space_classifications')

            new_obj = QuantityMember.objects.create(**fields)
            pk_map[old_pk] = new_obj
            quantity_member_m2m_data.append({'new_obj': new_obj, 'm2m_fields': m2m_fields})
        print(f"[DEBUG]   - QuantityMember 객체 생성 완료.")

        # 7. CostItem 생성
        print("[DEBUG] 7. CostItem 데이터 가져오기 중...")
        for data in import_data.get('CostItem', []):
            old_pk = data['pk']
            fields = data['fields']
            fields['project'] = new_project
            for fk_field in ['quantity_member', 'cost_code']:
                 if fields.get(fk_field):
                    fields[fk_field] = pk_map.get(fields[fk_field])
            new_obj = CostItem.objects.create(**fields)
            pk_map[old_pk] = new_obj
        print(f"[DEBUG]   - CostItem 생성 완료.")

        # 8. ManyToMany 관계 복원 (분리했던 데이터 사용)
        print("[DEBUG] 8. ManyToMany 관계 복원 중...")
        # RawElement M2M
        for item in raw_element_m2m_data:
            if 'classification_tags' in item['m2m_fields']:
                tag_pks = [pk_map[tag_pk].pk for tag_pk in item['m2m_fields']['classification_tags'] if tag_pk in pk_map]
                item['new_obj'].classification_tags.set(tag_pks)
            if 'space_classifications' in item['m2m_fields']:
                space_pks = [pk_map[space_pk].pk for space_pk in item['m2m_fields']['space_classifications'] if space_pk in pk_map]
                item['new_obj'].space_classifications.set(space_pks)
        print("    - RawElement M2M 관계 복원 완료.")

        # SpaceClassification M2M (mapped_elements)
        for item in space_m2m_data:
            if 'mapped_elements' in item['m2m_fields']:
                element_pks = [pk_map[el_pk].pk for el_pk in item['m2m_fields']['mapped_elements'] if el_pk in pk_map]
                item['new_obj'].mapped_elements.set(element_pks)
        print("    - SpaceClassification M2M 관계 복원 완료.")

        # QuantityMember M2M
        for item in quantity_member_m2m_data:
            if 'cost_codes' in item['m2m_fields']:
                cost_code_pks = [pk_map[cc_pk].pk for cc_pk in item['m2m_fields']['cost_codes'] if cc_pk in pk_map]
                item['new_obj'].cost_codes.set(cost_code_pks)
            if 'space_classifications' in item['m2m_fields']:
                space_pks = [pk_map[space_pk].pk for space_pk in item['m2m_fields']['space_classifications'] if space_pk in pk_map]
                item['new_obj'].space_classifications.set(space_pks)
        print("    - QuantityMember M2M 관계 복원 완료.")
        
        print(f"[DEBUG] --- 프로젝트 가져오기 성공: '{new_project_name}' ---")
        return JsonResponse({'status': 'success', 'message': '프로젝트를 성공적으로 가져왔습니다.'})

    except Exception as e:
        print(f"[ERROR] 프로젝트 가져오기 중 예외 발생: {e}")
        import traceback
        print(traceback.format_exc())
        transaction.set_rollback(True)
        return JsonResponse({'status': 'error', 'message': f'파일 처리 중 오류 발생: {e}'}, status=400)
    


# ▼▼▼ [수정] 단가 구분(UnitPriceType) API (Decimal 처리 불필요, 디버깅 추가) ▼▼▼
@require_http_methods(["GET", "POST", "PUT", "DELETE"])
def unit_price_types_api(request, project_id, type_id=None):
    """단가 구분(UnitPriceType) CRUD API"""
    print(f"\n[DEBUG][UnitPriceType API] Request received: method={request.method}, project_id={project_id}, type_id={type_id}")

    # --- GET: 목록 조회 ---
    if request.method == 'GET':
        try:
            types = UnitPriceType.objects.filter(project_id=project_id)
            data = [{'id': str(t.id), 'name': t.name, 'description': t.description} for t in types]
            print(f"[DEBUG][UnitPriceType API] GET: Found {len(data)} types.")
            return JsonResponse(data, safe=False)
        except Exception as e:
            print(f"[ERROR][UnitPriceType API] GET Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

    # --- POST: 새로 생성 ---
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            print(f"[DEBUG][UnitPriceType API] POST data: {data}")
            project = Project.objects.get(id=project_id)
            name = data.get('name')
            if not name:
                print("[ERROR][UnitPriceType API] POST Error: Name is required.")
                return JsonResponse({'status': 'error', 'message': '단가 구분 이름은 필수입니다.'}, status=400)

            unit_type, created = UnitPriceType.objects.get_or_create(
                project=project, name=name,
                defaults={'description': data.get('description', '')}
            )
            if created:
                print(f"[DEBUG][UnitPriceType API] POST: Created new type '{name}' (ID: {unit_type.id})")
                return JsonResponse({'status': 'success', 'message': '새 단가 구분이 생성되었습니다.', 'type': {'id': str(unit_type.id), 'name': unit_type.name, 'description': unit_type.description}})
            else:
                print(f"[WARN][UnitPriceType API] POST: Type '{name}' already exists.")
                return JsonResponse({'status': 'error', 'message': '이미 동일한 이름의 단가 구분이 존재합니다.'}, status=409)
        except Project.DoesNotExist:
            print(f"[ERROR][UnitPriceType API] POST Error: Project '{project_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            print(f"[ERROR][UnitPriceType API] POST Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    # --- PUT: 수정 ---
    elif request.method == 'PUT':
        if not type_id: return JsonResponse({'status': 'error', 'message': '수정할 단가 구분 ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            print(f"[DEBUG][UnitPriceType API] PUT data for ID {type_id}: {data}")
            unit_type = UnitPriceType.objects.get(id=type_id, project_id=project_id)
            new_name = data.get('name')

            if new_name and unit_type.name != new_name:
                if UnitPriceType.objects.filter(project_id=project_id, name=new_name).exists():
                    print(f"[ERROR][UnitPriceType API] PUT Error: Name '{new_name}' already in use.")
                    return JsonResponse({'status': 'error', 'message': '이미 사용 중인 이름입니다.'}, status=409)
                unit_type.name = new_name
                print(f"[DEBUG][UnitPriceType API] PUT: Name updated to '{new_name}' for ID {type_id}.")

            if 'description' in data:
                unit_type.description = data['description']
                print(f"[DEBUG][UnitPriceType API] PUT: Description updated for ID {type_id}.")

            unit_type.save()
            print(f"[DEBUG][UnitPriceType API] PUT: Type ID {type_id} saved successfully.")
            return JsonResponse({'status': 'success', 'message': '단가 구분이 수정되었습니다.', 'type': {'id': str(unit_type.id), 'name': unit_type.name, 'description': unit_type.description}})
        except UnitPriceType.DoesNotExist:
            print(f"[ERROR][UnitPriceType API] PUT Error: Type ID '{type_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '해당 단가 구분을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            print(f"[ERROR][UnitPriceType API] PUT Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    # --- DELETE: 삭제 ---
    elif request.method == 'DELETE':
        if not type_id: return JsonResponse({'status': 'error', 'message': '삭제할 단가 구분 ID가 필요합니다.'}, status=400)
        try:
            print(f"[DEBUG][UnitPriceType API] DELETE request for ID {type_id}")
            unit_type = UnitPriceType.objects.get(id=type_id, project_id=project_id)
            unit_type.delete()
            print(f"[DEBUG][UnitPriceType API] DELETE: Type ID {type_id} deleted successfully.")
            return JsonResponse({'status': 'success', 'message': '단가 구분이 삭제되었습니다.'})
        except UnitPriceType.DoesNotExist:
            print(f"[ERROR][UnitPriceType API] DELETE Error: Type ID '{type_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '해당 단가 구분을 찾을 수 없습니다.'}, status=404)
        except models.ProtectedError:
             print(f"[ERROR][UnitPriceType API] DELETE Error: Type ID '{type_id}' is protected (in use).")
             return JsonResponse({'status': 'error', 'message': '이 단가 구분은 현재 사용 중이므로 삭제할 수 없습니다.'}, status=400)
        except Exception as e:
            print(f"[ERROR][UnitPriceType API] DELETE Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


# ▼▼▼ [수정] 공사코드별 단가(UnitPrice) API (Decimal 처리 및 디버깅 추가) ▼▼▼
@require_http_methods(["GET", "POST", "PUT", "DELETE"])
def unit_prices_api(request, project_id, cost_code_id, price_id=None):
    """특정 공사코드에 대한 단가(UnitPrice) CRUD API"""
    print(f"\n[DEBUG][UnitPrice API] Request received: method={request.method}, project_id={project_id}, cost_code_id={cost_code_id}, price_id={price_id}")

    # --- GET: 목록 조회 ---
    if request.method == 'GET':
        try:
            prices = UnitPrice.objects.filter(project_id=project_id, cost_code_id=cost_code_id).select_related('unit_price_type')
            # Decimal을 문자열로 변환하여 JSON 직렬화 오류 방지
            data = [{
                'id': str(p.id),
                'unit_price_type_id': str(p.unit_price_type.id),
                'unit_price_type_name': p.unit_price_type.name,
                'material_cost': str(p.material_cost), # Decimal -> str
                'labor_cost': str(p.labor_cost),       # Decimal -> str
                'expense_cost': str(p.expense_cost),   # Decimal -> str
                'total_cost': str(p.total_cost),       # Decimal -> str
            } for p in prices]
            print(f"[DEBUG][UnitPrice API] GET: Found {len(data)} prices for CostCode {cost_code_id}.")
            return JsonResponse(data, safe=False)
        except Exception as e:
            print(f"[ERROR][UnitPrice API] GET Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

    # --- POST: 새로 생성 ---
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            print(f"[DEBUG][UnitPrice API] POST data for CostCode {cost_code_id}: {data}")
            project = Project.objects.get(id=project_id)
            cost_code = CostCode.objects.get(id=cost_code_id, project=project)
            unit_price_type = UnitPriceType.objects.get(id=data.get('unit_price_type_id'), project=project)

            # Decimal 변환 및 기본값 설정
            m_cost = decimal.Decimal(data.get('material_cost', '0.0') or '0.0')
            l_cost = decimal.Decimal(data.get('labor_cost', '0.0') or '0.0')
            e_cost = decimal.Decimal(data.get('expense_cost', '0.0') or '0.0')
            t_cost = decimal.Decimal(data.get('total_cost', '0.0') or '0.0') # 프론트에서 넘어온 total_cost도 받음

            # unique_together 제약으로 get_or_create 사용
            unit_price, created = UnitPrice.objects.get_or_create(
                project=project, cost_code=cost_code, unit_price_type=unit_price_type,
                defaults={'material_cost': m_cost, 'labor_cost': l_cost, 'expense_cost': e_cost, 'total_cost': t_cost}
            )

            if created:
                # 모델의 save() 메서드가 호출되어 total_cost가 재계산될 수 있음
                unit_price.refresh_from_db() # DB에 저장된 최종 값 다시 로드
                print(f"[DEBUG][UnitPrice API] POST: Created new price for Type '{unit_price_type.name}' (ID: {unit_price.id})")
                return JsonResponse({
                    'status': 'success', 'message': '새 단가가 추가되었습니다.',
                    'price': { # Decimal -> str 변환하여 응답
                        'id': str(unit_price.id),
                        'unit_price_type_id': str(unit_price.unit_price_type.id),
                        'unit_price_type_name': unit_price.unit_price_type.name,
                        'material_cost': str(unit_price.material_cost),
                        'labor_cost': str(unit_price.labor_cost),
                        'expense_cost': str(unit_price.expense_cost),
                        'total_cost': str(unit_price.total_cost),
                    }
                })
            else:
                print(f"[WARN][UnitPrice API] POST: Price for Type '{unit_price_type.name}' already exists.")
                return JsonResponse({'status': 'error', 'message': '해당 공사코드에 동일한 구분의 단가가 이미 존재합니다.'}, status=409)

        except (Project.DoesNotExist, CostCode.DoesNotExist, UnitPriceType.DoesNotExist) as e:
            print(f"[ERROR][UnitPrice API] POST Error: Related data not found - {e}")
            return JsonResponse({'status': 'error', 'message': '관련 데이터를 찾을 수 없습니다.'}, status=404)
        except (ValueError, decimal.InvalidOperation) as e:
             print(f"[ERROR][UnitPrice API] POST Error: Invalid number format - {e}")
             return JsonResponse({'status': 'error', 'message': '단가 값은 유효한 숫자로 입력해야 합니다.'}, status=400)
        except Exception as e:
            print(f"[ERROR][UnitPrice API] POST Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    # --- PUT: 수정 ---
    elif request.method == 'PUT':
        if not price_id: return JsonResponse({'status': 'error', 'message': '수정할 단가 ID가 필요합니다.'}, status=400)
        try:
            data = json.loads(request.body)
            print(f"[DEBUG][UnitPrice API] PUT data for Price ID {price_id}: {data}")
            unit_price = UnitPrice.objects.select_related('unit_price_type').get(id=price_id, project_id=project_id, cost_code_id=cost_code_id)

            updated = False
            # Decimal 변환 및 업데이트
            if 'material_cost' in data:
                new_val = decimal.Decimal(data['material_cost'] or '0.0')
                if unit_price.material_cost != new_val: unit_price.material_cost = new_val; updated = True
            if 'labor_cost' in data:
                new_val = decimal.Decimal(data['labor_cost'] or '0.0')
                if unit_price.labor_cost != new_val: unit_price.labor_cost = new_val; updated = True
            if 'expense_cost' in data:
                new_val = decimal.Decimal(data['expense_cost'] or '0.0')
                if unit_price.expense_cost != new_val: unit_price.expense_cost = new_val; updated = True
            if 'total_cost' in data: # 사용자가 합계를 직접 수정했을 경우 대비
                new_val = decimal.Decimal(data['total_cost'] or '0.0')
                # save() 메서드에서 최종 결정되므로 여기서는 일단 값만 설정
                unit_price.total_cost = new_val; updated = True # 변경 여부만 체크

            if updated:
                unit_price.save() # 모델의 save() 메서드 호출
                unit_price.refresh_from_db() # DB 최종 값 다시 로드
                print(f"[DEBUG][UnitPrice API] PUT: Price ID {price_id} updated successfully.")
                return JsonResponse({
                    'status': 'success', 'message': '단가가 수정되었습니다.',
                    'price': { # Decimal -> str 변환하여 응답
                        'id': str(unit_price.id),
                        'unit_price_type_id': str(unit_price.unit_price_type.id),
                        'unit_price_type_name': unit_price.unit_price_type.name,
                        'material_cost': str(unit_price.material_cost),
                        'labor_cost': str(unit_price.labor_cost),
                        'expense_cost': str(unit_price.expense_cost),
                        'total_cost': str(unit_price.total_cost),
                    }
                })
            else:
                 print(f"[INFO][UnitPrice API] PUT: No changes detected for Price ID {price_id}.")
                 return JsonResponse({'status': 'info', 'message': '변경된 내용이 없습니다.'})

        except UnitPrice.DoesNotExist:
            print(f"[ERROR][UnitPrice API] PUT Error: Price ID '{price_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '해당 단가를 찾을 수 없습니다.'}, status=404)
        except (ValueError, decimal.InvalidOperation) as e:
             print(f"[ERROR][UnitPrice API] PUT Error: Invalid number format - {e}")
             return JsonResponse({'status': 'error', 'message': '단가 값은 유효한 숫자로 입력해야 합니다.'}, status=400)
        except Exception as e:
            print(f"[ERROR][UnitPrice API] PUT Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    # --- DELETE: 삭제 ---
    elif request.method == 'DELETE':
        if not price_id: return JsonResponse({'status': 'error', 'message': '삭제할 단가 ID가 필요합니다.'}, status=400)
        try:
            print(f"[DEBUG][UnitPrice API] DELETE request for Price ID {price_id}")
            unit_price = UnitPrice.objects.get(id=price_id, project_id=project_id, cost_code_id=cost_code_id)
            unit_price.delete()
            print(f"[DEBUG][UnitPrice API] DELETE: Price ID {price_id} deleted successfully.")
            return JsonResponse({'status': 'success', 'message': '단가가 삭제되었습니다.'})
        except UnitPrice.DoesNotExist:
            print(f"[ERROR][UnitPrice API] DELETE Error: Price ID '{price_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '해당 단가를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            print(f"[ERROR][UnitPrice API] DELETE Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
# ▼▼▼ [추가] BOQ 항목들의 단가 기준 일괄 업데이트 API ▼▼▼
@require_http_methods(["POST"])
@transaction.atomic # 여러 항목 업데이트를 원자적으로 처리
def update_cost_item_unit_price_type(request, project_id):
    """
    선택된 CostItem들의 unit_price_type을 일괄적으로 업데이트합니다.
    """
    print(f"\n[DEBUG][Update UnitPriceType API] Request received for project {project_id}")
    try:
        data = json.loads(request.body)
        cost_item_ids = data.get('cost_item_ids', [])
        unit_price_type_id = data.get('unit_price_type_id') # null일 수도 있음

        if not cost_item_ids:
            print("[WARN][Update UnitPriceType API] No cost_item_ids provided.")
            return JsonResponse({'status': 'warning', 'message': '업데이트할 산출항목이 없습니다.'})

        # 업데이트할 대상 CostItem들을 가져옵니다.
        items_to_update = CostItem.objects.filter(project_id=project_id, id__in=cost_item_ids)
        update_count = items_to_update.count()

        if update_count == 0:
            print("[WARN][Update UnitPriceType API] No matching CostItems found to update.")
            return JsonResponse({'status': 'warning', 'message': '업데이트할 대상 산출항목을 찾을 수 없습니다.'})

        target_type = None
        target_type_name = "미지정"
        if unit_price_type_id:
            try:
                target_type = UnitPriceType.objects.get(project_id=project_id, id=unit_price_type_id)
                target_type_name = target_type.name
                print(f"[DEBUG][Update UnitPriceType API] Target UnitPriceType: '{target_type_name}' (ID: {unit_price_type_id})")
            except UnitPriceType.DoesNotExist:
                print(f"[ERROR][Update UnitPriceType API] UnitPriceType ID '{unit_price_type_id}' not found.")
                return JsonResponse({'status': 'error', 'message': '선택한 단가 기준을 찾을 수 없습니다.'}, status=404)
        else:
            print("[DEBUG][Update UnitPriceType API] Target UnitPriceType is None (clearing).")

        # .update() 메서드를 사용하여 한 번의 쿼리로 업데이트합니다.
        updated_rows = items_to_update.update(unit_price_type=target_type)

        print(f"[DEBUG][Update UnitPriceType API] Successfully updated {updated_rows} CostItems.")
        message = f"{updated_rows}개 산출항목의 단가 기준을 '{target_type_name}'(으)로 업데이트했습니다."
        return JsonResponse({'status': 'success', 'message': message, 'updated_count': updated_rows})

    except json.JSONDecodeError:
        print("[ERROR][Update UnitPriceType API] Invalid JSON received.")
        return JsonResponse({'status': 'error', 'message': '잘못된 요청 형식입니다.'}, status=400)
    except Exception as e:
        print(f"[ERROR][Update UnitPriceType API] An unexpected error occurred: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'status': 'error', 'message': f'업데이트 중 오류 발생: {str(e)}'}, status=500)
# ▲▲▲ [추가] 여기까지 입니다 ▲▲▲

# ▼▼▼ [추가] AI 모델 관리 API 뷰 함수들 ▼▼▼
@require_http_methods(["GET", "POST", "DELETE", "PUT"])
def ai_models_api(request, project_id, model_id=None):
    """AI 모델(.h5, .json) CRUD API"""
    print(f"\n[DEBUG][ai_models_api] Request: {request.method}, Project: {project_id}, Model: {model_id}")

    # --- GET: 모델 목록 또는 상세 정보 조회 ---
    if request.method == 'GET':
        try:
            if model_id: # 상세 조회 (이 부분은 변경 없음)
                # ... (기존 상세 조회 코드 유지) ...
                print(f"[DEBUG][ai_models_api] GET Details for model ID: {model_id}")
                return JsonResponse(data)
            else: # 목록 조회
                models = AIModel.objects.filter(project_id=project_id).order_by('-created_at') # 정렬 추가
                data = []
                for m in models:
                    # --- [수정 시작] 메타데이터 안전하게 처리 ---
                    metadata = {}
                    try:
                        # m.metadata가 유효한 dict인지 확인, 아니면 빈 dict 사용
                        metadata = m.metadata if isinstance(m.metadata, dict) else json.loads(m.metadata) if isinstance(m.metadata, str) else {}
                    except (json.JSONDecodeError, TypeError):
                        print(f"[WARN][ai_models_api] Could not parse metadata for model ID {m.id}. Using empty metadata.")
                        metadata = {} # 파싱 실패 시 빈 dict

                    input_features = metadata.get('input_features', [])
                    output_features = metadata.get('output_features', [])
                    performance = metadata.get('performance', {})
                    # --- [수정 끝] ---

                    model_data = {
                        'id': str(m.id),
                        'name': m.name,
                        'description': m.description,
                        # 메타데이터 내부 필드 직접 포함 (안전하게 접근된 값 사용)
                        'input_features': input_features if isinstance(input_features, list) else [],
                        'output_features': output_features if isinstance(output_features, list) else [],
                        'performance': performance if isinstance(performance, dict) else {},
                        'created_at': m.created_at.isoformat(),
                    }
                    data.append(model_data)

                print(f"[DEBUG][ai_models_api] GET List: Found {len(data)} models.")
                return JsonResponse(data, safe=False)
        except Exception as e:
            print(f"[ERROR][ai_models_api] GET Error: {e}")
            import traceback
            print(traceback.format_exc()) # 상세 에러 로그 추가
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

    # --- POST: 새 모델 업로드 ---
    elif request.method == 'POST':
        try:
            project = get_object_or_404(Project, id=project_id)
            name = request.POST.get('name')
            description = request.POST.get('description', '')
            h5_file = request.FILES.get('h5_file')
            json_file = request.FILES.get('json_file')
            metadata_manual = request.POST.get('metadata_manual') # 수동 입력 메타데이터 (JSON 문자열)

            print(f"[DEBUG][ai_models_api] POST Upload: name='{name}', h5_file={'Yes' if h5_file else 'No'}, json_file={'Yes' if json_file else 'No'}, metadata_manual={'Yes' if metadata_manual else 'No'}")

            if not name or not h5_file:
                print("[ERROR][ai_models_api] POST Error: Name and h5_file are required.")
                return JsonResponse({'status': 'error', 'message': '모델 이름과 .h5 파일은 필수입니다.'}, status=400)

            metadata = {}
            if json_file:
                try:
                    metadata = json.load(json_file)
                    print("[DEBUG][ai_models_api] Metadata loaded from json_file.")
                except json.JSONDecodeError:
                    print("[ERROR][ai_models_api] POST Error: Invalid JSON file format.")
                    return JsonResponse({'status': 'error', 'message': '.json 파일 형식이 올바르지 않습니다.'}, status=400)
            elif metadata_manual:
                try:
                    metadata = json.loads(metadata_manual)
                    print("[DEBUG][ai_models_api] Metadata loaded from manual input.")
                except json.JSONDecodeError:
                    print("[ERROR][ai_models_api] POST Error: Invalid manual metadata JSON format.")
                    return JsonResponse({'status': 'error', 'message': '수동 입력한 메타데이터 형식이 올바르지 않습니다.'}, status=400)
            else: # 메타데이터가 없으면 기본값 사용 또는 오류 처리 (여기선 기본값)
                print("[WARN][ai_models_api] No metadata provided, using default empty dict.")
                metadata = {'input_features': [], 'output_features': [], 'performance': {}} # 기본 구조

            # .h5 파일 내용 읽기
            h5_content = h5_file.read()
            print(f"[DEBUG][ai_models_api] Read h5_file content ({len(h5_content)} bytes).")

            new_model = AIModel.objects.create(
                project=project,
                name=name,
                description=description,
                h5_file_content=h5_content,
                metadata=metadata
            )
            print(f"[DEBUG][ai_models_api] New AIModel created successfully (ID: {new_model.id}).")
            return JsonResponse({'status': 'success', 'message': 'AI 모델이 성공적으로 업로드되었습니다.', 'model_id': str(new_model.id)})

        except Project.DoesNotExist:
            print(f"[ERROR][ai_models_api] POST Error: Project '{project_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            print(f"[ERROR][ai_models_api] POST Error: {e}")
            import traceback
            print(traceback.format_exc())
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

    # --- PUT: 모델 정보 수정 (파일 제외) ---
    elif request.method == 'PUT':
        if not model_id: return JsonResponse({'status': 'error', 'message': '모델 ID가 필요합니다.'}, status=400)
        try:
            model_obj = get_object_or_404(AIModel, id=model_id, project_id=project_id)
            data = json.loads(request.body)
            print(f"[DEBUG][ai_models_api] PUT Update for model ID {model_id}: {data}")

            updated = False
            if 'name' in data and data['name'] != model_obj.name:
                # 이름 중복 체크
                if AIModel.objects.filter(project_id=project_id, name=data['name']).exclude(id=model_id).exists():
                    return JsonResponse({'status': 'error', 'message': '이미 사용 중인 모델 이름입니다.'}, status=409)
                model_obj.name = data['name']
                updated = True
                print(f"[DEBUG][ai_models_api]   - Name updated to '{data['name']}'.")
            if 'description' in data and data['description'] != model_obj.description:
                model_obj.description = data['description']
                updated = True
                print(f"[DEBUG][ai_models_api]   - Description updated.")
            if 'metadata' in data and data['metadata'] != model_obj.metadata:
                model_obj.metadata = data['metadata']
                updated = True
                print(f"[DEBUG][ai_models_api]   - Metadata updated.")

            if updated:
                model_obj.save()
                print(f"[DEBUG][ai_models_api] Model ID {model_id} updated successfully.")
                return JsonResponse({'status': 'success', 'message': '모델 정보가 업데이트되었습니다.'})
            else:
                print(f"[INFO][ai_models_api] No changes detected for model ID {model_id}.")
                return JsonResponse({'status': 'info', 'message': '변경된 내용이 없습니다.'})

        except AIModel.DoesNotExist:
            print(f"[ERROR][ai_models_api] PUT Error: Model ID '{model_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '모델을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            print(f"[ERROR][ai_models_api] PUT Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

    # --- DELETE: 모델 삭제 ---
    elif request.method == 'DELETE':
        if not model_id: return JsonResponse({'status': 'error', 'message': '모델 ID가 필요합니다.'}, status=400)
        try:
            model_obj = get_object_or_404(AIModel, id=model_id, project_id=project_id)
            model_name = model_obj.name
            model_obj.delete()
            print(f"[DEBUG][ai_models_api] DELETE: Model '{model_name}' (ID: {model_id}) deleted successfully.")
            return JsonResponse({'status': 'success', 'message': f"모델 '{model_name}'이(가) 삭제되었습니다."})
        except AIModel.DoesNotExist:
            print(f"[ERROR][ai_models_api] DELETE Error: Model ID '{model_id}' not found.")
            return JsonResponse({'status': 'error', 'message': '모델을 찾을 수 없습니다.'}, status=404)
        except Exception as e:
            print(f"[ERROR][ai_models_api] DELETE Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_http_methods(["GET"])
def download_ai_model(request, project_id, model_id):
    """AI 모델(.h5)과 메타데이터(.json) 파일을 각각 다운로드하는 API"""
    try:
        model_obj = get_object_or_404(AIModel, id=model_id, project_id=project_id)
        print(f"[DEBUG][download_ai_model] Request to download model '{model_obj.name}' (ID: {model_id})")

        file_type = request.GET.get('type', 'h5') # 기본은 h5, json 요청 가능

        if file_type == 'h5':
            print("[DEBUG][download_ai_model] Preparing .h5 file for download.")
            response = HttpResponse(model_obj.h5_file_content, content_type='application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="{model_obj.name}.h5"'
            return response
        elif file_type == 'json':
            print("[DEBUG][download_ai_model] Preparing .json metadata file for download.")
            response = HttpResponse(json.dumps(model_obj.metadata, indent=2, ensure_ascii=False), content_type='application/json')
            response['Content-Disposition'] = f'attachment; filename="{model_obj.name}_metadata.json"'
            return response
        else:
            print(f"[ERROR][download_ai_model] Invalid file type requested: {file_type}")
            return JsonResponse({'status': 'error', 'message': '잘못된 파일 타입입니다 (h5 또는 json).'}, status=400)

    except AIModel.DoesNotExist:
        print(f"[ERROR][download_ai_model] Model ID '{model_id}' not found.")
        return JsonResponse({'status': 'error', 'message': '모델을 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        print(f"[ERROR][download_ai_model] Error: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

# ▲▲▲ [추가] 여기까지 ▲▲▲


# ▼▼▼ [추가] AI 모델 학습 관련 API 뷰 함수들 ▼▼▼

# 임시 파일 저장 경로 (settings.py에 정의하는 것이 더 좋음)
TEMP_UPLOAD_DIR = os.path.join(settings.BASE_DIR, 'temp_uploads')
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

@require_http_methods(["POST"])
def upload_training_csv(request, project_id):
    """학습용 CSV 파일을 임시 저장하고 헤더 정보를 반환"""
    print(f"\n[DEBUG][upload_training_csv] Received CSV upload request for project: {project_id}")
    if not request.FILES.get('training_csv'):
        print("[ERROR][upload_training_csv] No CSV file found in request.")
        return JsonResponse({'status': 'error', 'message': '학습용 CSV 파일이 필요합니다.'}, status=400)

    try:
        project = get_object_or_404(Project, id=project_id)
        csv_file = request.FILES['training_csv']

        # 파일 이름에 프로젝트 ID와 타임스탬프를 포함하여 충돌 방지
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        temp_filename = f"proj_{project_id}_train_{timestamp}.csv"
        temp_filepath = os.path.join(TEMP_UPLOAD_DIR, temp_filename)

        # 파일을 임시 경로에 저장
        with open(temp_filepath, 'wb+') as destination:
            for chunk in csv_file.chunks():
                destination.write(chunk)
        print(f"[DEBUG][upload_training_csv] CSV file saved temporarily to: {temp_filepath}")

        # Pandas로 CSV를 읽어 헤더(컬럼명) 추출
        df = pd.read_csv(temp_filepath)
        headers = df.columns.tolist()
        print(f"[DEBUG][upload_training_csv] Extracted headers: {headers}")

        return JsonResponse({
            'status': 'success',
            'message': 'CSV 파일 업로드 성공. 헤더 정보를 반환합니다.',
            'temp_filename': temp_filename, # 나중에 학습 시작 시 파일 식별용
            'headers': headers
        })

    except Project.DoesNotExist:
        print(f"[ERROR][upload_training_csv] Project '{project_id}' not found.")
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except pd.errors.EmptyDataError:
        print("[ERROR][upload_training_csv] Uploaded CSV file is empty.")
        if os.path.exists(temp_filepath): os.remove(temp_filepath) # 빈 파일 삭제
        return JsonResponse({'status': 'error', 'message': '업로드된 CSV 파일이 비어 있습니다.'}, status=400)
    except Exception as e:
        print(f"[ERROR][upload_training_csv] Error processing CSV: {e}")
        import traceback
        print(traceback.format_exc())
        if 'temp_filepath' in locals() and os.path.exists(temp_filepath): os.remove(temp_filepath) # 오류 시 임시 파일 삭제
        return JsonResponse({'status': 'error', 'message': f'CSV 처리 중 오류 발생: {str(e)}'}, status=500)

# 학습 진행 상태를 저장할 딕셔너리 (간단한 인메모리 방식)
training_progress = {}

# WebSocket으로 진행률 전송하는 함수
def send_training_progress(project_id, task_id, progress_data):
    """WebSocket을 통해 특정 프로젝트의 학습 진행률 브로드캐스트"""
    print(f"[DEBUG][WebSocket Send] Sending progress for task {task_id}: {progress_data}")
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        FrontendConsumer.frontend_group_name,
        {
            'type': 'broadcast_training_progress', # consumers.py에 핸들러 추가 필요
            'project_id': str(project_id),
            'task_id': task_id,
            'progress': progress_data,
        }
    )

# Keras 학습 콜백 정의 (진행률 업데이트용)
class ProgressCallback(keras.callbacks.Callback):
    def __init__(self, project_id, task_id):
        super().__init__()
        self.project_id = project_id
        self.task_id = task_id
        self.epoch_data = [] # 에포크별 손실/정확도 저장

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        current_progress = {
            'epoch': epoch + 1,
            'loss': logs.get('loss'),
            'val_loss': logs.get('val_loss'), # 검증 손실 추가 (있을 경우)
            # 필요 시 다른 메트릭 추가 (accuracy 등)
        }
        self.epoch_data.append(current_progress)
        progress_update = {
            'status': 'running',
            'current_epoch': epoch + 1,
            'total_epochs': self.params['epochs'],
            'loss': logs.get('loss'),
            'val_loss': logs.get('val_loss'),
            'epoch_history': self.epoch_data # 전체 히스토리 전송 (그래프용)
        }
        # WebSocket으로 전송 (1초마다 보내므로 여기서는 매 에포크마다 전송)
        send_training_progress(self.project_id, self.task_id, progress_update)
        # 터미널에도 출력
        print(f"  [Train Task {self.task_id}] Epoch {epoch+1}/{self.params['epochs']} - loss: {logs.get('loss'):.4f}, val_loss: {logs.get('val_loss'):.4f}")

# 실제 학습 로직 함수 (백그라운드 스레드에서 실행됨)
def run_ai_training_task(project_id, task_id, temp_filename, config):
    print(f"\n[DEBUG][Training Task {task_id}] Background training started for project: {project_id}")
    temp_filepath = os.path.join(TEMP_UPLOAD_DIR, temp_filename)

    try:
        # 0. 초기 상태 전송
        send_training_progress(project_id, task_id, {'status': 'starting', 'message': '학습 데이터 로딩 중...'})

        # 1. 데이터 로드 및 전처리
        print(f"  [Train Task {task_id}] Loading data from: {temp_filepath}")
        df = pd.read_csv(temp_filepath)
        print(f"  [Train Task {task_id}] Data loaded successfully. Shape: {df.shape}")

        input_features = config['input_features']
        output_features = config['output_features']
        print(f"  [Train Task {task_id}] Input features: {input_features}")
        print(f"  [Train Task {task_id}] Output features: {output_features}")

        # 입력/출력 데이터 분리 및 NaN 처리 (여기서는 간단히 0으로 채움)
        X = df[input_features].fillna(0).values
        y = df[output_features].fillna(0).values
        print(f"  [Train Task {task_id}] Features (X) shape: {X.shape}")
        print(f"  [Train Task {task_id}] Targets (y) shape: {y.shape}")

        # 데이터 분할 (학습/검증)
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
        print(f"  [Train Task {task_id}] Data split: Train={X_train.shape[0]}, Validation={X_val.shape[0]}")

        # 정규화 (StandardScaler 사용) - 설정에 따라 적용
        scaler_X = None
        if config.get('normalize_inputs', False):
            print(f"  [Train Task {task_id}] Normalizing input features...")
            scaler_X = StandardScaler()
            X_train = scaler_X.fit_transform(X_train)
            X_val = scaler_X.transform(X_val)
        scaler_y = None # 출력값 정규화는 일반적으로 회귀 문제에서 필요할 수 있음 (선택 사항)
        # if config.get('normalize_outputs', False):
        #     scaler_y = StandardScaler()
        #     y_train = scaler_y.fit_transform(y_train)
        #     y_val = scaler_y.transform(y_val)

        send_training_progress(project_id, task_id, {'status': 'preprocessing_done', 'message': '모델 구성 중...'})

        # 2. Keras 모델 구성
        print(f"  [Train Task {task_id}] Building Keras model...")
        model = keras.Sequential()
        # 입력 레이어
        model.add(keras.layers.Input(shape=(len(input_features),)))
        # 은닉 레이어
        hidden_layers = config.get('hidden_layers', 1)
        nodes_per_layer = config.get('nodes_per_layer', 64)
        for _ in range(hidden_layers):
            model.add(keras.layers.Dense(nodes_per_layer, activation='relu')) # 기본 활성화 함수: ReLU
        # 출력 레이어 (활성화 함수 없음 - 회귀 문제 가정)
        model.add(keras.layers.Dense(len(output_features)))
        print(f"  [Train Task {task_id}] Model summary:")
        model.summary(print_fn=lambda x: print(f"    {x}"))

        # 3. 모델 컴파일
        optimizer_name = config.get('optimizer', 'adam').lower()
        learning_rate = config.get('learning_rate', 0.001)
        print(f"  [Train Task {task_id}] Compiling model with optimizer={optimizer_name}, lr={learning_rate}...")
        if optimizer_name == 'adam':
            optimizer = keras.optimizers.Adam(learning_rate=learning_rate)
        else: # 기본값 또는 다른 옵티마이저 추가 가능
            optimizer = keras.optimizers.Adam(learning_rate=learning_rate)

        model.compile(optimizer=optimizer, loss='mse') # 기본 손실 함수: Mean Squared Error

        # 4. 모델 학습
        epochs = config.get('epochs', 10)
        print(f"  [Train Task {task_id}] Starting training for {epochs} epochs...")
        send_training_progress(project_id, task_id, {'status': 'training_started', 'message': f'총 {epochs} 에포크 학습 시작...'})

        progress_callback = ProgressCallback(project_id, task_id)
        history = model.fit(
            X_train, y_train,
            epochs=epochs,
            validation_data=(X_val, y_val),
            callbacks=[progress_callback],
            verbose=0 # 콜백에서 로그를 처리하므로 여기서는 끔
        )
        print(f"  [Train Task {task_id}] Training finished.")

        # 5. 최종 성능 평가 (간단히 마지막 에포크의 검증 손실 사용)
        final_val_loss = history.history['val_loss'][-1]
        print(f"  [Train Task {task_id}] Final validation loss: {final_val_loss:.4f}")

        # 6. 모델 저장 준비 (임시 파일)
        trained_model_filename = f"proj_{project_id}_trained_{task_id}.h5"
        trained_model_filepath = os.path.join(TEMP_UPLOAD_DIR, trained_model_filename)
        model.save(trained_model_filepath)
        print(f"  [Train Task {task_id}] Trained model saved temporarily to: {trained_model_filepath}")

        # 7. 메타데이터 생성
        metadata = {
            'input_features': input_features,
            'output_features': output_features,
            'training_config': config,
            'performance': {'final_validation_loss': final_val_loss},
            'scaler_X_params': scaler_X.get_params() if scaler_X else None, # 정규화 파라미터 저장
            # 'scaler_y_params': scaler_y.get_params() if scaler_y else None,
        }
        print(f"  [Train Task {task_id}] Metadata generated.")

        # 최종 상태 전송 (성공)
        final_progress = {
            'status': 'completed',
            'message': f'학습 완료! 최종 검증 손실: {final_val_loss:.4f}',
            'final_val_loss': final_val_loss,
            'trained_model_filename': trained_model_filename, # 다운로드 또는 DB 저장에 사용
            'metadata': metadata,
            'epoch_history': progress_callback.epoch_data # 최종 그래프 데이터
        }
        send_training_progress(project_id, task_id, final_progress)
        training_progress[task_id] = final_progress # 최종 결과 저장

    except Exception as e:
        error_message = f"학습 중 오류 발생: {str(e)}"
        print(f"[ERROR][Training Task {task_id}] {error_message}")
        import traceback
        print(traceback.format_exc())
        error_progress = {'status': 'error', 'message': error_message}
        send_training_progress(project_id, task_id, error_progress)
        training_progress[task_id] = error_progress # 오류 상태 저장
    finally:
        # 임시 CSV 파일 삭제
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
                print(f"  [Train Task {task_id}] Temporary CSV file deleted: {temp_filepath}")
            except Exception as e:
                print(f"[ERROR][Training Task {task_id}] Failed to delete temporary CSV file {temp_filepath}: {e}")
        print(f"[DEBUG][Training Task {task_id}] Background training finished.")

@require_http_methods(["POST"])
def start_ai_training(request, project_id):
    """백그라운드에서 AI 모델 학습 시작"""
    print(f"\n[DEBUG][start_ai_training] Received training start request for project: {project_id}")
    try:
        project = get_object_or_404(Project, id=project_id)
        config = json.loads(request.body)
        temp_filename = config.get('temp_filename')

        if not temp_filename or not os.path.exists(os.path.join(TEMP_UPLOAD_DIR, temp_filename)):
            print(f"[ERROR][start_ai_training] Invalid or missing temp_filename: {temp_filename}")
            return JsonResponse({'status': 'error', 'message': '유효하지 않은 학습 데이터 파일입니다.'}, status=400)

        # ▼▼▼ [확인] 이 부분이 올바르게 있는지 확인 ▼▼▼
        # 고유한 작업 ID 생성
        task_id = str(uuid.uuid4())
        # ▲▲▲ [확인] 여기까지 ▲▲▲
        print(f"[DEBUG][start_ai_training] Generated Task ID: {task_id}")
        print(f"[DEBUG][start_ai_training] Training Config: {config}")

        # 초기 진행 상태 설정
        training_progress[task_id] = {'status': 'queued', 'message': '학습 대기 중...'}

        # 백그라운드 스레드 생성 및 시작
        thread = threading.Thread(target=run_ai_training_task, args=(project_id, task_id, temp_filename, config))
        thread.start()
        print(f"[DEBUG][start_ai_training] Background training thread started for Task ID: {task_id}")

        return JsonResponse({
            'status': 'success',
            'message': 'AI 모델 학습이 시작되었습니다. 진행률은 실시간으로 업데이트됩니다.',
            'task_id': task_id
        })

    except Project.DoesNotExist:
        print(f"[ERROR][start_ai_training] Project '{project_id}' not found.")
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except json.JSONDecodeError:
        print("[ERROR][start_ai_training] Invalid JSON data in request body.")
        return JsonResponse({'status': 'error', 'message': '잘못된 요청 데이터 형식입니다.'}, status=400)
    except Exception as e:
        print(f"[ERROR][start_ai_training] Error starting training: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'status': 'error', 'message': f'학습 시작 중 오류 발생: {str(e)}'}, status=500)

# ▲▲▲ [추가] 여기까지 ▲▲▲

# ▼▼▼ [추가] 개산견적(SD) 관련 API 뷰 함수들 ▼▼▼
@require_http_methods(["GET"])
@require_http_methods(["GET"])
def get_sd_cost_codes_with_quantity(request, project_id):
    """(수정) 개산견적(SD)용으로 활성화되고 수량이 0보다 큰 공사코드 목록과 총 수량 합계를 반환"""
    print(f"\n[DEBUG][get_sd_cost_codes_with_quantity] Request for project: {project_id}")
    try:
        project = get_object_or_404(Project, id=project_id)

        # ai_sd_enabled=True 인 공사코드 필터링
        sd_codes_qs = CostCode.objects.filter(project=project, ai_sd_enabled=True)
        print(f"[DEBUG][get_sd_cost_codes_with_quantity] Found {sd_codes_qs.count()} potentially SD-enabled cost codes initially.")

        # 해당 공사코드를 사용하는 CostItem들의 수량 합계 계산 (Decimal 사용)
        cost_item_quantities = CostItem.objects.filter(
            project=project,
            cost_code__in=sd_codes_qs
        ).values('cost_code_id').annotate(
            total_quantity=Sum(
                Case( # quantity가 null인 경우 0으로 처리
                    When(quantity__isnull=True, then=Value(0.0)), # Float 0.0 사용
                    default=F('quantity'),
                    output_field=FloatField() # ★★★ output_field를 FloatField로 변경 ★★★
                )
            )
        )

        # 수량이 0보다 큰 cost_code_id만 필터링하고 맵 생성 (비교 시 float 사용)
        quantity_map = {
            # str(item['cost_code_id']): item['total_quantity']
            # for item in cost_item_quantities if item['total_quantity'] is not None and item['total_quantity'] > 0.0 # 0.0 (float)과 비교
            str(item['cost_code_id']): Decimal(str(item['total_quantity'])) # DB 조회 후 Decimal로 변환
            for item in cost_item_quantities if item['total_quantity'] is not None and item['total_quantity'] > 0.0
        }
        print(f"[DEBUG][get_sd_cost_codes_with_quantity] Calculated non-zero quantity sums for {len(quantity_map)} cost codes.")

        # 최종 응답 데이터 구성 (수량이 있는 코드만 포함)
        data = []
        sd_codes_filtered = sd_codes_qs.filter(id__in=[uuid.UUID(k) for k in quantity_map.keys()])
        print(f"[DEBUG][get_sd_cost_codes_with_quantity] Filtering down to {sd_codes_filtered.count()} codes with quantity > 0.")

        for code in sd_codes_filtered:
            code_id_str = str(code.id)
            total_quantity = quantity_map.get(code_id_str, Decimal('0.0')) # 합계 가져오기 (이미 Decimal)
            data.append({
                'id': code_id_str,
                'code': code.code,
                'name': code.name,
                'unit': code.unit,
                # Decimal을 문자열로 변환 (기존 코드 유지)
                'total_quantity': str(total_quantity.quantize(Decimal("0.0001"))) if total_quantity is not None else '0.0000'
            })

        print(f"[DEBUG][get_sd_cost_codes_with_quantity] Returning {len(data)} SD-enabled cost codes with quantity > 0.")
        return JsonResponse(data, safe=False)

    except Project.DoesNotExist:
        print(f"[ERROR][get_sd_cost_codes_with_quantity] Project '{project_id}' not found.")
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        print(f"[ERROR][get_sd_cost_codes_with_quantity] Error: {e}")
        import traceback
        print(traceback.format_exc()) # 상세 에러 로그 추가
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_http_methods(["GET"])
def get_sd_cost_items(request, project_id):
    """개산견적(SD) 탭 하단 테이블에 표시할 CostItem 목록 반환 (generate_boq_report_api 와 유사)"""
    print(f"\n[DEBUG][get_sd_cost_items] Request for project: {project_id}")
    try:
        project = get_object_or_404(Project, id=project_id)

        # SD용 공사코드 필터 적용
        items_qs = CostItem.objects.filter(project=project, cost_code__ai_sd_enabled=True).select_related(
            'cost_code',
            'quantity_member__raw_element', # BIM 연동 위해 필요
            'quantity_member__member_mark',
            'quantity_member__classification_tag',
        )
        print(f"[DEBUG][get_sd_cost_items] Found {items_qs.count()} SD-enabled cost items.")

        # 데이터 가공 (기존 cost_items_api 와 유사하게 필요한 정보 포함)
        data = []
        for item in items_qs:
            item_data = {
                'id': str(item.id),
                'quantity': item.quantity,
                'cost_code_name': f"{item.cost_code.code} - {item.cost_code.name}",
                'cost_code_unit': item.cost_code.unit,
                'quantity_member_id': str(item.quantity_member_id) if item.quantity_member_id else None,
                'quantity_member_name': item.quantity_member.name if item.quantity_member else None,
                'classification_tag_name': item.quantity_member.classification_tag.name if item.quantity_member and item.quantity_member.classification_tag else None,
                'member_mark_name': item.quantity_member.member_mark.mark if item.quantity_member and item.quantity_member.member_mark else None,
                'raw_element_id': str(item.quantity_member.raw_element_id) if item.quantity_member and item.quantity_member.raw_element else None,
                'raw_element_unique_id': item.quantity_member.raw_element.element_unique_id if item.quantity_member and item.quantity_member.raw_element else None,
                # 필요 시 추가 속성 포함
            }
            data.append(item_data)

        print(f"[DEBUG][get_sd_cost_items] Returning {len(data)} items for SD table.")
        return JsonResponse(data, safe=False)

    except Project.DoesNotExist:
        print(f"[ERROR][get_sd_cost_items] Project '{project_id}' not found.")
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except Exception as e:
        print(f"[ERROR][get_sd_cost_items] Error: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    

@require_http_methods(["POST"])
@transaction.atomic # DB 저장 및 임시 파일 삭제를 원자적으로 처리
def save_trained_model_api(request, project_id):
    """
    백그라운드 학습 후 임시 저장된 .h5 파일과 메타데이터를
    AIModel 데이터베이스 레코드로 저장합니다.
    """
    print(f"\n[DEBUG][save_trained_model_api] Received request to save trained model for project: {project_id}")
    try:
        data = json.loads(request.body)
        temp_h5_filename = data.get('temp_h5_filename')
        model_name = data.get('name')
        metadata = data.get('metadata')
        description = data.get('description', '')

        print(f"[DEBUG][save_trained_model_api] Payload: name='{model_name}', temp_file='{temp_h5_filename}'")

        if not all([temp_h5_filename, model_name, metadata is not None]):
            print("[ERROR][save_trained_model_api] Missing required fields in request.")
            return JsonResponse({'status': 'error', 'message': '저장에 필요한 정보(임시 파일명, 모델 이름, 메타데이터)가 누락되었습니다.'}, status=400)

        project = get_object_or_404(Project, id=project_id)

        # 이름 중복 검사 (DB 측에서 다시 확인)
        if AIModel.objects.filter(project=project, name=model_name).exists():
            print(f"[ERROR][save_trained_model_api] Model name '{model_name}' already exists in DB.")
            return JsonResponse({'status': 'error', 'message': f"모델 이름 '{model_name}'이(가) 이미 존재합니다."}, status=409)

        # 임시 h5 파일 경로 확인 및 내용 읽기
        temp_h5_filepath = os.path.join(TEMP_UPLOAD_DIR, temp_h5_filename)
        print(f"[DEBUG][save_trained_model_api] Reading content from temporary file: {temp_h5_filepath}")
        if not os.path.exists(temp_h5_filepath):
            print(f"[ERROR][save_trained_model_api] Temporary file not found: {temp_h5_filepath}")
            return JsonResponse({'status': 'error', 'message': '학습된 모델 파일(임시)을 찾을 수 없습니다.'}, status=404)

        with open(temp_h5_filepath, 'rb') as f:
            h5_content = f.read()
        print(f"[DEBUG][save_trained_model_api] Read {len(h5_content)} bytes from temporary file.")

        # 새 AIModel 객체 생성 및 저장
        new_model = AIModel.objects.create(
            project=project,
            name=model_name,
            description=description,
            h5_file_content=h5_content,
            metadata=metadata
        )
        print(f"[DEBUG][save_trained_model_api] New AIModel created in DB (ID: {new_model.id})")

        # 임시 h5 파일 삭제
        try:
            os.remove(temp_h5_filepath)
            print(f"[DEBUG][save_trained_model_api] Temporary file deleted: {temp_h5_filepath}")
        except Exception as e:
            # 파일 삭제 실패는 치명적 오류는 아니므로 경고만 로깅
            print(f"[WARN][save_trained_model_api] Failed to delete temporary file {temp_h5_filepath}: {e}")

        return JsonResponse({
            'status': 'success',
            'message': f"학습된 모델 '{model_name}'이(가) 성공적으로 저장되었습니다.",
            'model_id': str(new_model.id)
        })

    except Project.DoesNotExist:
        print(f"[ERROR][save_trained_model_api] Project '{project_id}' not found.")
        return JsonResponse({'status': 'error', 'message': '프로젝트를 찾을 수 없습니다.'}, status=404)
    except json.JSONDecodeError:
        print("[ERROR][save_trained_model_api] Invalid JSON data in request body.")
        return JsonResponse({'status': 'error', 'message': '잘못된 요청 데이터 형식입니다.'}, status=400)
    except Exception as e:
        print(f"[ERROR][save_trained_model_api] Error saving trained model: {e}")
        import traceback
        print(traceback.format_exc())
        transaction.set_rollback(True) # 오류 발생 시 롤백
        return JsonResponse({'status': 'error', 'message': f'모델 저장 중 오류 발생: {str(e)}'}, status=500)
    

@require_http_methods(["GET"])
def download_temp_file_api(request):
    """
    GET 파라미터로 전달된 임시 파일(주로 학습된 .h5)을 다운로드합니다.
    보안을 위해 파일명 검증을 수행합니다.
    """
    print(f"\n[DEBUG][download_temp_file_api] Received request to download temporary file.")
    try:
        filename = request.GET.get('filename')
        file_type = request.GET.get('type') # 'h5' or 'json' (json은 현재 프론트에서 처리)
        download_name = request.GET.get('download_name', filename) # 다운로드 시 사용할 파일명

        print(f"[DEBUG][download_temp_file_api] Params: filename='{filename}', type='{file_type}', download_name='{download_name}'")

        if not filename or not file_type:
            print("[ERROR][download_temp_file_api] Missing 'filename' or 'type' parameter.")
            raise Http404("필수 파라미터가 누락되었습니다.")

        # 보안: 파일명이 .. 등을 포함하지 않는지, TEMP_UPLOAD_DIR 내에 있는지 확인
        if '..' in filename or filename.startswith('/'):
            print(f"[ERROR][download_temp_file_api] Invalid filename detected: {filename}")
            raise Http404("잘못된 파일명입니다.")

        temp_filepath = os.path.join(TEMP_UPLOAD_DIR, filename)
        # 실제 파일 경로 확인 (os.path.abspath 사용 권장)
        abs_filepath = os.path.abspath(temp_filepath)
        abs_temp_dir = os.path.abspath(TEMP_UPLOAD_DIR)

        print(f"[DEBUG][download_temp_file_api] Attempting to access file: {abs_filepath}")
        if not abs_filepath.startswith(abs_temp_dir):
             print(f"[ERROR][download_temp_file_api] Directory traversal attempt detected: {abs_filepath}")
             raise Http404("접근 권한이 없습니다.")

        if not os.path.exists(abs_filepath):
            print(f"[ERROR][download_temp_file_api] Temporary file not found: {abs_filepath}")
            raise Http404("요청한 임시 파일을 찾을 수 없습니다.")

        # 파일 타입에 따라 처리
        if file_type == 'h5':
            content_type = 'application/octet-stream'
        elif file_type == 'json': # JSON 다운로드도 여기서 처리 가능하게 확장
            content_type = 'application/json'
        else:
             print(f"[ERROR][download_temp_file_api] Unsupported file type: {file_type}")
             raise Http404("지원하지 않는 파일 타입입니다.")

        # FileResponse를 사용하여 대용량 파일도 효율적으로 처리
        response = FileResponse(open(abs_filepath, 'rb'), content_type=content_type)
        # Content-Disposition 설정 (urlquote 사용하여 UTF-8 파일명 처리)
        response['Content-Disposition'] = f'attachment; filename="{urlquote(download_name)}"'
        print(f"[DEBUG][download_temp_file_api] Sending file '{download_name}' ({os.path.getsize(abs_filepath)} bytes)")
        return response

    except Http404 as e:
         print(f"[ERROR][download_temp_file_api] 404 Error: {e}")
         # 404 오류는 Django가 기본 HTML 페이지를 반환하도록 그대로 둡니다.
         # JsonResponse 대신 Http404를 raise하면 Django가 처리합니다.
         raise e
    except Exception as e:
        print(f"[ERROR][download_temp_file_api] Error downloading temp file: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'status': 'error', 'message': f'파일 다운로드 중 오류 발생: {str(e)}'}, status=500)
    

# connections/views.py

# ▼▼▼ [교체] 기존 predict_sd_cost 함수 전체를 아래 코드로 교체 ▼▼▼
@require_http_methods(["POST"])
def predict_sd_cost(request, project_id, model_id):
    """(수정) 선택된 AI 모델과 입력을 사용해 개산견적 비용 예측 및 오차범위 계산"""
    print(f"\n[DEBUG][predict_sd_cost] Prediction request for project: {project_id}, model: {model_id}")
    temp_model_path = None # 임시 파일 경로 변수 초기화
    try:
        model_obj = get_object_or_404(AIModel, id=model_id, project_id=project_id)
        input_data_dict = json.loads(request.body)
        print(f"[DEBUG][predict_sd_cost] Input data received: {input_data_dict}")

        metadata = model_obj.metadata
        input_features = metadata.get('input_features')
        output_features = metadata.get('output_features')
        performance_metrics = metadata.get('performance', {}) # 성능 메트릭 가져오기
        # 오차 계산에 사용할 loss 값 (없으면 0으로 간주)
        loss_value = performance_metrics.get('final_validation_loss', 0.0)

        if not input_features or not output_features:
            print("[ERROR][predict_sd_cost] Model metadata is incomplete (missing features).")
            return JsonResponse({'status': 'error', 'message': '선택된 모델의 메타데이터(입력/출력 정보)가 완전하지 않습니다.'}, status=400)

        # 입력 데이터 준비 (메타데이터 순서에 맞게)
        input_values = []
        for feature in input_features:
            value = input_data_dict.get(feature)
            if value is None:
                print(f"[ERROR][predict_sd_cost] Missing input value for feature: {feature}")
                return JsonResponse({'status': 'error', 'message': f"입력값 '{feature}'이(가) 누락되었습니다."}, status=400)
            try:
                input_values.append(float(value))
            except (ValueError, TypeError): # TypeError 추가
                print(f"[ERROR][predict_sd_cost] Invalid numeric value for feature '{feature}': {value}")
                return JsonResponse({'status': 'error', 'message': f"입력값 '{feature}'은(는) 숫자여야 합니다."}, status=400)

        input_array = np.array([input_values]) # 모델 입력 형식 (2D 배열)
        print(f"[DEBUG][predict_sd_cost] Prepared input array shape: {input_array.shape}, values: {input_array}")

        # 입력 정규화 (학습 시 사용된 경우)
        scaler_X_params = metadata.get('scaler_X_params')
        if scaler_X_params and scaler_X_params.get('mean_') is not None and scaler_X_params.get('scale_') is not None:
            print("[DEBUG][predict_sd_cost] Applying input scaler...")
            scaler_X = StandardScaler()
            # 저장된 mean/scale 값 로드 (길이 체크 추가)
            mean_ = np.array(scaler_X_params['mean_'])
            scale_ = np.array(scaler_X_params['scale_'])
            if len(mean_) == len(input_features) and len(scale_) == len(input_features):
                scaler_X.mean_ = mean_
                scaler_X.scale_ = scale_
                try:
                    input_array = scaler_X.transform(input_array)
                    print(f"[DEBUG][predict_sd_cost] Scaled input array: {input_array}")
                except ValueError as e:
                    print(f"[ERROR][predict_sd_cost] Error applying scaler transform: {e}. Check feature count.")
                    # 오류 발생 시 정규화 없이 진행하거나 에러 반환 (여기서는 에러 반환)
                    return JsonResponse({'status': 'error', 'message': f'입력값 정규화 중 오류 발생: {e}'}, status=500)
            else:
                print("[WARN][predict_sd_cost] Scaler parameters length mismatch. Skipping scaling.")
        else:
             print("[DEBUG][predict_sd_cost] No scaler parameters found or incomplete. Skipping scaling.")


        # 모델 로드 (DB의 바이너리 데이터로부터 임시 파일 사용)
        print("[DEBUG][predict_sd_cost] Loading Keras model from database binary data...")
        temp_model_path = os.path.join(TEMP_UPLOAD_DIR, f"temp_predict_{model_id}.h5")
        with open(temp_model_path, 'wb') as f:
            f.write(model_obj.h5_file_content)
        print(f"[DEBUG][predict_sd_cost] Model content written to temporary file: {temp_model_path}")

        # --- [핵심 수정] compile=False 옵션 추가 ---
        try:
            model = models.load_model(temp_model_path, compile=False) # <<< compile=False 추가
            print("[DEBUG][predict_sd_cost] Model loaded successfully using models.load_model with compile=False.")
        except Exception as load_err: # 로드 실패 시 추가 디버깅
            print(f"[ERROR][predict_sd_cost] Failed to load model even with compile=False: {load_err}")
            import traceback
            print(traceback.format_exc())
            raise load_err # 에러를 다시 발생시켜 아래 except 블록에서 처리되도록 함
        # --- [핵심 수정] 여기까지 ---

        # 예측 수행
        predictions_raw = model.predict(input_array)
        print(f"[DEBUG][predict_sd_cost] Raw predictions (shape {predictions_raw.shape}): {predictions_raw}")
        
        # 예측 결과 후처리 (정규화 역변환 등 - 여기서는 생략)
        # scaler_y_params = metadata.get('scaler_y_params')
        # if scaler_y_params:
        #     scaler_y = StandardScaler()
        #     scaler_y.mean_ = np.array(scaler_y_params['mean_'])
        #     scaler_y.scale_ = np.array(scaler_y_params['scale_'])
        #     predictions = scaler_y.inverse_transform(predictions_raw)
        # else:
        predictions = predictions_raw

        # 결과 딕셔너리 생성 및 오차 범위 계산
        results = {}
        if predictions.ndim == 2 and predictions.shape[0] == 1: # 결과가 (1, num_outputs) 형태인지 확인
            prediction_values = predictions[0] # 첫 번째 (유일한) 샘플의 예측값 사용
            if len(prediction_values) == len(output_features):
                for i, feature in enumerate(output_features):
                    pred_value = float(prediction_values[i]) # NumPy float -> Python float
                    # loss_value를 백분율 오차로 간주하여 범위 계산 (단순 방식)
                    # loss 값이 너무 크거나 작으면 범위가 비현실적일 수 있음
                    error_margin = abs(pred_value * loss_value) if loss_value > 0 else 0.0
                    min_value = pred_value - error_margin
                    max_value = pred_value + error_margin
                    results[feature] = {
                        'predicted': pred_value,
                        'min': min_value,
                        'max': max_value,
                        'loss_used': loss_value # 계산에 사용된 loss 값 포함
                    }
                print(f"[DEBUG][predict_sd_cost] Formatted prediction results with range: {results}")
            else:
                print(f"[ERROR][predict_sd_cost] Prediction output dimension ({len(prediction_values)}) mismatch with metadata ({len(output_features)}).")
                return JsonResponse({'status': 'error', 'message': '모델 예측 결과의 차원이 메타데이터와 일치하지 않습니다.'}, status=500)
        else:
             print(f"[ERROR][predict_sd_cost] Unexpected prediction output shape: {predictions.shape}")
             return JsonResponse({'status': 'error', 'message': '모델 예측 결과의 형식이 예상과 다릅니다.'}, status=500)


        return JsonResponse({'status': 'success', 'predictions': results})

    except (AIModel.DoesNotExist, Project.DoesNotExist):
        print(f"[ERROR][predict_sd_cost] Model or Project not found.")
        return JsonResponse({'status': 'error', 'message': '모델 또는 프로젝트를 찾을 수 없습니다.'}, status=404)
    except json.JSONDecodeError:
        print("[ERROR][predict_sd_cost] Invalid JSON input data.")
        return JsonResponse({'status': 'error', 'message': '잘못된 입력 데이터 형식입니다.'}, status=400)
    except FileNotFoundError as e:
         print(f"[ERROR][predict_sd_cost] Model file loading error: {e}")
         return JsonResponse({'status': 'error', 'message': f'모델 파일 로딩 중 오류 발생 (파일 경로 확인 필요): {e}'}, status=500)
    except Exception as e:
        print(f"[ERROR][predict_sd_cost] Prediction error: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({'status': 'error', 'message': f'예측 중 오류 발생: {str(e)}'}, status=500)
    finally:
        # 임시 모델 파일 삭제
        if temp_model_path and os.path.exists(temp_model_path):
            try:
                os.remove(temp_model_path)
                print(f"[DEBUG][predict_sd_cost] Temporary model file deleted: {temp_model_path}")
            except Exception as e:
                print(f"[WARN][predict_sd_cost] Failed to delete temporary model file {temp_model_path}: {e}")
# ▲▲▲ [교체] 여기까지 ▲▲▲