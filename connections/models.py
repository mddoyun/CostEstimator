# connections/models.py
import uuid
from django.db import models

# -----------------------------------------------------------------------------
# 1. 프로젝트 관리 모듈
# -----------------------------------------------------------------------------
class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, default="새 프로젝트")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

# -----------------------------------------------------------------------------
# 2. 분류 기준 항목 (기초 데이터)
# -----------------------------------------------------------------------------
class QuantityClassificationTag(models.Model):
    """'건축_골조_슬래브_RC' 등 수량산출을 위한 분류(태그) 정의"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='classification_tags')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    required_properties = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('project', 'name')
        ordering = ['name']

    def __str__(self):
        return self.name

class CostCode(models.Model):
    """'철근가공조립', '콘크리트타설' 등 최종 내역 항목을 구성하기 위한 공사코드"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='cost_codes')
    code = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    spec = models.TextField(blank=True, null=True)
    unit = models.CharField(max_length=50, blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('project', 'code')
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name}"

class MemberMark(models.Model):
    """부재일람부호 (예: C1, G1, B1 등)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='member_marks')
    mark = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    properties = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ('project', 'mark')
        ordering = ['mark']

    def __str__(self):
        return self.mark


class SpaceClassification(models.Model):
    """'부지 > 건물 > 층 > 공간' 등 위계를 가지는 공간 분류"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='space_classifications')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ('project', 'parent', 'name') # 같은 부모 아래에 동일한 이름의 자식은 없도록 설정

    def __str__(self):
        return self.name
# -----------------------------------------------------------------------------
# 3. 메인 데이터 (핵심 흐름)
# -----------------------------------------------------------------------------
class RawElement(models.Model):
    """Revit에서 가져온 원본 BIM 객체 데이터"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='raw_elements')
    element_unique_id = models.CharField(max_length=255)
    raw_data = models.JSONField()
    classification_tags = models.ManyToManyField(QuantityClassificationTag, related_name='raw_elements', blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('project', 'element_unique_id')

    def __str__(self):
        return f"{self.project.name} - {self.element_unique_id}"

class QuantityMember(models.Model):
    """수량산출의 기본 단위가 되는 부재"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='quantity_members', on_delete=models.CASCADE)
    raw_element = models.ForeignKey(RawElement, related_name='quantity_members', on_delete=models.SET_NULL, null=True, blank=True)
    
    classification_tag = models.ForeignKey(QuantityClassificationTag, related_name='quantity_members', on_delete=models.CASCADE, null=True, blank=True)
    
    cost_codes = models.ManyToManyField(CostCode, related_name='quantity_members', blank=True)
    member_mark = models.ForeignKey(MemberMark, on_delete=models.SET_NULL, related_name='quantity_members', null=True, blank=True)    
    name = models.CharField(max_length=255, blank=True)
    properties = models.JSONField(default=dict, blank=True)
    mapping_expression = models.JSONField(default=dict, blank=True, verbose_name="맵핑식(json)")
    member_mark_expression = models.CharField(max_length=255, blank=True, help_text="개별 부재에 적용될 일람부호(Mark) 값 표현식")
    
    space_classifications = models.ManyToManyField(SpaceClassification, related_name='quantity_members', blank=True)

    cost_code_expressions = models.JSONField(default=list, blank=True, help_text="개별 부재에 적용될 공사코드 표현식 목록 (JSON)")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        tag_name = self.classification_tag.name if self.classification_tag else "미분류"
        return f"{self.name or '이름 없는 부재'} ({tag_name})"

    class Meta:
        ordering = ['created_at']

class CostItem(models.Model):
    """최종 내역서를 구성하는 가장 작은 단위 항목"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='cost_items')
    quantity_member = models.ForeignKey(QuantityMember, on_delete=models.SET_NULL, null=True, blank=True, related_name='cost_items')
    cost_code = models.ForeignKey(CostCode, on_delete=models.PROTECT, related_name='cost_items')
    quantity = models.FloatField(default=0.0)
    
    quantity_mapping_expression = models.JSONField(default=dict, blank=True, verbose_name="수량 맵핑식(json)")

    description = models.TextField(blank=True, null=True, help_text="수동 생성 시 특이사항 기록")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.cost_code.name} - Qty: {self.quantity}"

# -----------------------------------------------------------------------------
# 4. 룰셋 (자동화 엔진)
# -----------------------------------------------------------------------------
class ClassificationRule(models.Model):
    """'조건'에 맞는 RawElement에 'Tag'를 할당하는 규칙"""
    # [수정] 중복 정의되었던 모델 중 하나를 삭제했습니다.
    project = models.ForeignKey(Project, related_name='classification_rules', on_delete=models.CASCADE)
    target_tag = models.ForeignKey(QuantityClassificationTag, related_name='rules', on_delete=models.CASCADE)
    conditions = models.JSONField(default=list)
    priority = models.IntegerField(default=0)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['priority']

    def __str__(self):
        return f"Rule for {self.target_tag.name} in {self.project.name}"

class PropertyMappingRule(models.Model):
    """'조건'에 맞는 RawElement의 속성을 '맵핑식'에 따라 계산하여 QuantityMember의 속성으로 자동 생성하는 규칙"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='property_mapping_rules', on_delete=models.CASCADE)
    name = models.CharField(max_length=255, default="새 속성 맵핑 규칙")
    description = models.TextField(blank=True, null=True)
    target_tag = models.ForeignKey(QuantityClassificationTag, related_name='property_mapping_rules', on_delete=models.CASCADE, help_text="이 규칙이 적용될 대상 수량산출분류")
    conditions = models.JSONField(default=list, blank=True, help_text="규칙이 적용될 RawElement를 필터링하는 조건 (ClassificationRule과 동일한 구조)")
    mapping_script = models.JSONField(default=dict, help_text="속성을 계산하고 맵핑하는 스크립트. 예: {'체적': '{Volume} * 1.05'}")
    priority = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self):
        return f"{self.name} (for {self.target_tag.name})"
    

    
class CostCodeRule(models.Model):
    """'조건'에 맞는 QuantityMember와 '공사코드' 조합에 대한 '수량' 계산 규칙"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='cost_code_rules', on_delete=models.CASCADE)
    name = models.CharField(max_length=255, default="새 공사코드 룰셋")
    description = models.TextField(blank=True, null=True)
    target_cost_code = models.ForeignKey(CostCode, related_name='cost_code_rules', on_delete=models.CASCADE, help_text="이 규칙이 적용될 대상 공사코드")
    conditions = models.JSONField(default=list, blank=True, help_text="규칙이 적용될 QuantityMember를 필터링하는 조건")
    quantity_mapping_script = models.JSONField(default=dict, help_text="수량을 계산하는 맵핑 스크립트. 예: {'수량': '({면적} + [철근총길이]) * 1.05'}")
    priority = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self):
        return f"{self.name} (for {self.target_cost_code.name})"
    

    
class MemberMarkAssignmentRule(models.Model):
    """'조건'에 맞는 QuantityMember에 MemberMark를 할당하는 규칙"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='member_mark_assignment_rules', on_delete=models.CASCADE)
    name = models.CharField(max_length=255, default="새 일람부호 할당 규칙")
    conditions = models.JSONField(default=list, blank=True, help_text="규칙이 적용될 QuantityMember를 필터링하는 조건")
    mark_expression = models.CharField(max_length=255, help_text="할당할 일람부호(Mark) 값을 반환하는 표현식. 예: 'C' + str({층})")
    priority = models.IntegerField(default=0)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self):
        return self.name

class CostCodeAssignmentRule(models.Model):
    """'조건'에 맞는 QuantityMember에 CostCode를 할당하는 규칙"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='cost_code_assignment_rules', on_delete=models.CASCADE)
    name = models.CharField(max_length=255, default="새 공사코드 할당 규칙")
    conditions = models.JSONField(default=list, blank=True, help_text="규칙이 적용될 QuantityMember를 필터링하는 조건")
    # 공사코드는 code와 name이 있으므로 JSON으로 여러 표현식을 관리합니다.
    cost_code_expressions = models.JSONField(default=dict, help_text="할당할 공사코드의 속성을 반환하는 표현식. 예: {'code': 'RC-{층}', 'name': '{분류} 타설'}")
    priority = models.IntegerField(default=0)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self):
        return self.name
    

