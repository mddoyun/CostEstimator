# connections/admin.py

from django.contrib import admin
# ▼▼▼ [수정] AIModel 임포트 추가 ▼▼▼
from .models import UnitPriceType, UnitPrice, AIModel
# ▲▲▲ [수정] 여기까지 ▲▲▲

# Register your models here.

# ▼▼▼ [추가] AIModel 관리자 설정 추가 ▼▼▼
@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'description', 'created_at', 'updated_at')
    list_filter = ('project',)
    search_fields = ('name', 'description')
    # readonly_fields = ('h5_file_content',) # 바이너리 데이터는 관리자에서 직접 수정하지 않도록 설정 (선택 사항)

    def save_model(self, request, obj, form, change):
        # 디버깅: 관리자 페이지에서 AIModel 저장 시 로그 출력
        print(f"[DEBUG][AIModelAdmin.save_model] Saving AIModel: {obj.name} (Project: {obj.project.name})")
        super().save_model(request, obj, form, change)
# ▲▲▲ [추가] 여기까지 ▲▲▲

@admin.register(UnitPriceType)
class UnitPriceTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'description', 'created_at')
    list_filter = ('project',)
    search_fields = ('name',)

    def save_model(self, request, obj, form, change):
        # 디버깅: 관리자 페이지에서 UnitPriceType 저장 시 로그 출력
        print(f"[DEBUG][UnitPriceTypeAdmin.save_model] Saving UnitPriceType: {obj.name}")
        super().save_model(request, obj, form, change)

@admin.register(UnitPrice)
class UnitPriceAdmin(admin.ModelAdmin):
    list_display = ('cost_code', 'unit_price_type', 'material_cost', 'labor_cost', 'expense_cost', 'total_cost', 'project_name', 'updated_at') # project -> project_name
    list_filter = ('project', 'unit_price_type', 'cost_code__category')
    search_fields = ('cost_code__code', 'cost_code__name', 'unit_price_type__name')
    # readonly_fields = ('total_cost',) # total_cost가 이제 DB 필드이므로 readonly 제거 (필요 시 유지)

    def project_name(self, obj): # Admin 페이지에서 Project 이름 보이도록
        return obj.project.name
    project_name.short_description = 'Project' # 컬럼 헤더 이름 변경
    project_name.admin_order_field = 'project'

    def save_model(self, request, obj, form, change):
        # 디버깅: 관리자 페이지에서 UnitPrice 저장 시 로그 출력
        print(f"[DEBUG][UnitPriceAdmin.save_model] Saving UnitPrice for {obj.cost_code.code} / {obj.unit_price_type.name}")
        super().save_model(request, obj, form, change)