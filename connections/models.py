# connections/models.py
import uuid
from django.db import models
import decimal # <--- decimal 임포트 추가 (정확한 계산 위해)
# ▼▼▼ [추가] AI 모델 저장을 위한 BinaryField 임포트 ▼▼▼
from django.db.models import BinaryField
# ▲▲▲ [추가] 여기까지 ▲▲▲

# -----------------------------------------------------------------------------
# 1. 프로젝트 관리 모듈
# -----------------------------------------------------------------------------
class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, default="새 프로젝트")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        # 디버깅: 프로젝트 이름 반환 확인
        print(f"[DEBUG][Project.__str__] Returning project name: {self.name}")
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
        # 디버깅: 태그 이름 반환 확인
        # print(f"[DEBUG][QuantityClassificationTag.__str__] Returning tag name: {self.name}") # 너무 빈번할 수 있어 주석 처리
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
    # ▼▼▼ [수정] ai_sd_enabled 필드 verbose_name 추가 ▼▼▼
    ai_sd_enabled = models.BooleanField(default=False, verbose_name="개산견적(SD) 사용")       # AI개략견적활용여부
    # ▲▲▲ [수정] 여기까지 ▲▲▲
    dd_enabled    = models.BooleanField(default=False, verbose_name="상세견적(DD) 사용")       # 상세견적활용여부
    class Meta:
        unique_together = ('project', 'code')
        ordering = ['code']

    def __str__(self):
        # 디버깅: 공사코드 정보 반환 확인
        # print(f"[DEBUG][CostCode.__str__] Returning cost code: {self.code} - {self.name}") # 너무 빈번할 수 있어 주석 처리
        return f"{self.code} - {self.name}"

# ▼▼▼ [추가] AI 모델 저장을 위한 새 모델 정의 ▼▼▼
class AIModel(models.Model):
    """업로드되거나 학습된 AI 모델(.h5)과 메타데이터(.json)를 저장"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='ai_models')
    name = models.CharField(max_length=255, help_text="모델 이름")
    description = models.TextField(blank=True, null=True, help_text="모델 설명")
    h5_file_content = BinaryField(help_text=".h5 모델 파일의 바이너리 데이터")
    metadata = models.JSONField(default=dict, help_text="모델 메타데이터 (입력/출력 피처, 성능 등)")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('project', 'name')
        ordering = ['-created_at']

    def __str__(self):
        # 디버깅: AI 모델 이름 반환 확인
        print(f"[DEBUG][AIModel.__str__] Returning AI model name: {self.name}")
        return self.name
# ▲▲▲ [추가] 여기까지 ▲▲▲

class UnitPriceType(models.Model):
    """단가의 구분을 정의 (예: 표준단가, 조사단가, 시장단가 등)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='unit_price_types')
    name = models.CharField(max_length=100, help_text="단가 구분 이름 (예: 표준단가)")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('project', 'name')
        ordering = ['name']

    def __str__(self):
        # 디버깅: 단가 구분 이름 반환 확인
        # print(f"[DEBUG][UnitPriceType.__str__] Returning type name: {self.name}") # 너무 빈번할 수 있어 주석 처리
        return self.name

class UnitPrice(models.Model):
    """개별 공사코드에 대한 특정 구분(Type)의 단가 정보"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='unit_prices')
    cost_code = models.ForeignKey(CostCode, on_delete=models.CASCADE, related_name='unit_prices')
    unit_price_type = models.ForeignKey(UnitPriceType, on_delete=models.PROTECT, related_name='unit_prices', help_text="단가 구분")

    # ▼▼▼ [수정] DecimalField로 변경하여 정확도 향상 ▼▼▼
    material_cost = models.DecimalField(max_digits=19, decimal_places=4, default=decimal.Decimal('0.0'), help_text="재료비 단가")
    labor_cost = models.DecimalField(max_digits=19, decimal_places=4, default=decimal.Decimal('0.0'), help_text="노무비 단가")
    expense_cost = models.DecimalField(max_digits=19, decimal_places=4, default=decimal.Decimal('0.0'), help_text="경비 단가")
    total_cost = models.DecimalField(max_digits=19, decimal_places=4, default=decimal.Decimal('0.0'), help_text="합계 단가 (재료비+노무비+경비 또는 직접 입력)")
    # ▲▲▲ [수정] 여기까지 입니다 ▲▲▲

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ▼▼▼ [추가] save 메서드 오버라이드 ▼▼▼
    def save(self, *args, **kwargs):
        # 디버깅: UnitPrice 저장 시작
        print(f"[DEBUG][UnitPrice.save] Saving UnitPrice for CostCode '{self.cost_code.code}', Type '{self.unit_price_type.name}'")
        print(f"[DEBUG][UnitPrice.save] Incoming values: M={self.material_cost}, L={self.labor_cost}, E={self.expense_cost}, T={self.total_cost}")

        # Decimal 타입으로 변환 (입력이 float이나 문자열일 수 있으므로)
        m_cost = decimal.Decimal(self.material_cost or '0.0')
        l_cost = decimal.Decimal(self.labor_cost or '0.0')
        e_cost = decimal.Decimal(self.expense_cost or '0.0')
        t_cost = decimal.Decimal(self.total_cost or '0.0')

        # 재료비, 노무비, 경비 중 하나라도 0보다 큰 값이 있으면 합계를 다시 계산하여 덮어쓴다.
        if m_cost > 0 or l_cost > 0 or e_cost > 0:
            calculated_total = m_cost + l_cost + e_cost
            # Decimal 비교 시 타입 일치 확인
            current_total_decimal = decimal.Decimal(self.total_cost or '0.0')
            if current_total_decimal != calculated_total:
                 print(f"[DEBUG][UnitPrice.save] Recalculating total_cost: {calculated_total} (overwriting {self.total_cost})")
                 self.total_cost = calculated_total
            else:
                 print("[DEBUG][UnitPrice.save] Component costs provided, total_cost matches calculated value.")
        # 재료비, 노무비, 경비가 모두 0인데 합계가 0보다 크면, 사용자가 직접 입력한 것으로 간주하고 그 값을 유지한다.
        elif t_cost > 0:
            print("[DEBUG][UnitPrice.save] Component costs are zero, using directly provided total_cost.")
            # 컴포넌트 비용을 0으로 명시적 설정
            self.material_cost = decimal.Decimal('0.0')
            self.labor_cost = decimal.Decimal('0.0')
            self.expense_cost = decimal.Decimal('0.0')
            self.total_cost = t_cost # 입력된 합계값 사용
        # 모든 값이 0이면 그냥 0으로 저장
        else:
             print("[DEBUG][UnitPrice.save] All costs are zero.")
             self.material_cost = decimal.Decimal('0.0')
             self.labor_cost = decimal.Decimal('0.0')
             self.expense_cost = decimal.Decimal('0.0')
             self.total_cost = decimal.Decimal('0.0')

        # 디버깅: 최종 저장될 값 확인
        print(f"[DEBUG][UnitPrice.save] Final values before super().save: M={self.material_cost}, L={self.labor_cost}, E={self.expense_cost}, T={self.total_cost}")
        super().save(*args, **kwargs) # 부모의 save 메서드 호출하여 실제 저장
    # ▲▲▲ [추가] 여기까지 입니다. ▲▲▲


    class Meta:
        unique_together = ('cost_code', 'unit_price_type')
        ordering = ['cost_code__code', 'unit_price_type__name']

    def __str__(self):
        # total_cost 필드를 직접 사용하도록 변경
        # 디버깅: UnitPrice 정보 반환 확인
        # print(f"[DEBUG][UnitPrice.__str__] Returning UnitPrice info for {self.cost_code.code}") # 너무 빈번할 수 있어 주석 처리
        return f"{self.cost_code.code} - {self.unit_price_type.name}: {self.total_cost}"

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
        # 디버깅: 일람부호 반환 확인
        # print(f"[DEBUG][MemberMark.__str__] Returning mark: {self.mark}") # 너무 빈번할 수 있어 주석 처리
        return self.mark


class SpaceClassification(models.Model):
    """'부지 > 건물 > 층 > 공간' 등 위계를 가지는 공간 분류"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='space_classifications')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_at = models.DateTimeField(auto_now_add=True)
    mapped_elements = models.ManyToManyField('RawElement', related_name='space_classifications', blank=True)

    # ▼▼▼ [수정] 이 필드를 ForeignKey(unique=True)에서 OneToOneField로 변경해주세요. ▼▼▼
    source_element = models.OneToOneField(
        'RawElement',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='source_of_space',
        help_text="이 공간분류를 생성한 원본 BIM 객체"
    )
    # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲


    class Meta:
        ordering = ['name']
        unique_together = ('project', 'parent', 'name')

    def __str__(self):
        # 디버깅: 공간 분류 이름 반환 확인
        # print(f"[DEBUG][SpaceClassification.__str__] Returning space name: {self.name}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: RawElement 정보 반환 확인
        # print(f"[DEBUG][RawElement.__str__] Returning RawElement info for project {self.project.name}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: QuantityMember 정보 반환 확인
        # print(f"[DEBUG][QuantityMember.__str__] Returning QuantityMember: {self.name or '이름 없는 부재'} ({tag_name})") # 너무 빈번할 수 있어 주석 처리
        return f"{self.name or '이름 없는 부재'} ({tag_name})"

    class Meta:
        ordering = ['created_at']

class CostItem(models.Model):
    """최종 내역서를 구성하는 가장 작은 단위 항목"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='cost_items')
    quantity_member = models.ForeignKey(QuantityMember, on_delete=models.CASCADE, null=True, blank=True, related_name='cost_items')
    cost_code = models.ForeignKey(CostCode, on_delete=models.PROTECT, related_name='cost_items')
    quantity = models.FloatField(default=0.0)

    quantity_mapping_expression = models.JSONField(default=dict, blank=True, verbose_name="수량 맵핑식(json)")

    unit_price_type = models.ForeignKey(
            UnitPriceType,
            on_delete=models.SET_NULL, # UnitPriceType 삭제 시 이 필드를 null로 설정
            null=True,                 # DB에서 null 허용
            blank=True,                # Django Admin 등에서 빈 값 허용
            related_name='cost_items',
            help_text="이 산출항목에 적용할 단가 기준"
        )

    description = models.TextField(blank=True, null=True, help_text="수동 생성 시 특이사항 기록")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        # 디버깅: CostItem 정보 반환 확인
        # print(f"[DEBUG][CostItem.__str__] Returning CostItem: {self.cost_code.name} - Qty: {self.quantity}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: 분류 규칙 정보 반환 확인
        # print(f"[DEBUG][ClassificationRule.__str__] Returning rule for {self.target_tag.name}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: 속성 매핑 규칙 정보 반환 확인
        # print(f"[DEBUG][PropertyMappingRule.__str__] Returning mapping rule: {self.name}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: 공사코드 규칙 정보 반환 확인
        # print(f"[DEBUG][CostCodeRule.__str__] Returning cost code rule: {self.name}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: 일람부호 할당 규칙 정보 반환 확인
        # print(f"[DEBUG][MemberMarkAssignmentRule.__str__] Returning mark assignment rule: {self.name}") # 너무 빈번할 수 있어 주석 처리
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
        # 디버깅: 공사코드 할당 규칙 정보 반환 확인
        # print(f"[DEBUG][CostCodeAssignmentRule.__str__] Returning cost code assignment rule: {self.name}") # 너무 빈번할 수 있어 주석 처리
        return self.name


# ▼▼▼ [추가] 공간분류 자동 생성을 위한 룰 모델 ▼▼▼
class SpaceClassificationRule(models.Model):
    """BIM 객체 데이터로부터 공간분류 위계를 자동으로 생성하기 위한 규칙"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='space_classification_rules')

    level_depth = models.IntegerField(help_text="위계 수준 (0=최상위)")
    level_name = models.CharField(max_length=100, help_text="위계의 이름 (예: Project, Site, Building)")

    bim_object_filter = models.JSONField(help_text="이 위계에 해당하는 BIM 객체를 찾는 조건")
    name_source_param = models.CharField(max_length=255, help_text="공간분류의 이름으로 사용할 BIM 객체의 속성 이름")

    # 상위 위계와의 연결을 위한 규칙
    parent_join_param = models.CharField(max_length=255, blank=True, help_text="상위 객체에서 연결에 사용할 속성 (예: GlobalId)")
    child_join_param = models.CharField(max_length=255, blank=True, help_text="현재 객체에서 상위 객체와 연결에 사용할 속성 (예: ParentGlobalId)")

    class Meta:
        unique_together = ('project', 'level_depth')
        ordering = ['project', 'level_depth']

    def __str__(self):
        # 디버깅: 공간 분류 생성 규칙 정보 반환 확인
        # print(f"[DEBUG][SpaceClassificationRule.__str__] Returning space classification rule for level {self.level_depth}") # 너무 빈번할 수 있어 주석 처리
        return f"{self.project.name} - Level {self.level_depth}: {self.level_name}"


class SpaceAssignmentRule(models.Model):
    """'조건'에 맞는 QuantityMember와 SpaceClassification을 동적으로 찾아 연결(Join)하는 규칙"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='space_assignment_rules', on_delete=models.CASCADE)
    name = models.CharField(max_length=255, default="새 동적 공간 할당 규칙")

    # 1. 어떤 부재에 적용할지 결정하는 필터 (선택 사항)
    member_filter_conditions = models.JSONField(default=list, blank=True, help_text="규칙을 적용할 수량산출부재를 필터링하는 조건 (JSON)")

    # 2. 부재와 공간을 연결할 '키'가 되는 속성 경로
    member_join_property = models.CharField(max_length=255, help_text="매칭에 사용할 부재의 속성 경로 (예: BIM원본.참조 레벨)")
    space_join_property = models.CharField(max_length=255, help_text="매칭에 사용할 공간의 속성 경로 (예: Name 또는 BIM원본.Name)")

    priority = models.IntegerField(default=0)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self):
        # 디버깅: 공간 할당 규칙 정보 반환 확인
        # print(f"[DEBUG][SpaceAssignmentRule.__str__] Returning space assignment rule: {self.name}") # 너무 빈번할 수 있어 주석 처리
        return self.name