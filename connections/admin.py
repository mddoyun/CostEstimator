# connections/admin.py

from django.contrib import admin
from .models import UnitPriceType, UnitPrice # <--- 추가

# Register your models here.

@admin.register(UnitPriceType)
class UnitPriceTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'description', 'created_at')
    list_filter = ('project',)
    search_fields = ('name',)

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