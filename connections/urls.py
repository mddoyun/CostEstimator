# connections/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('export-tags/<uuid:project_id>/', views.export_tags, name='export_tags'),
    path('import-tags/<uuid:project_id>/', views.import_tags, name='import_tags'),
    # --- 기본 프로젝트 및 태그 관리 ---
    path('create-project/', views.create_project, name='create_project'),
    path('export-tags/<uuid:project_id>/', views.export_tags, name='export_tags'),
    path('import-tags/<uuid:project_id>/', views.import_tags, name='import_tags'),

    # --- 룰셋 API ---
    path('api/rules/classification/<uuid:project_id>/', views.classification_rules_api, name='classification_rules_api'),
    path('api/rules/classification/<uuid:project_id>/<int:rule_id>/', views.classification_rules_api, name='classification_rule_detail_api'),
    path('api/rules/apply-classification/<uuid:project_id>/', views.apply_classification_rules_view, name='apply_classification_rules'),
    
    path('api/rules/property-mapping/<uuid:project_id>/', views.property_mapping_rules_api, name='property_mapping_rules_api'),
    path('api/rules/property-mapping/<uuid:project_id>/<uuid:rule_id>/', views.property_mapping_rules_api, name='property_mapping_rule_detail_api'),

    path('api/rules/cost-code/<uuid:project_id>/', views.cost_code_rules_api, name='cost_code_rules_api'),
    path('api/rules/cost-code/<uuid:project_id>/<uuid:rule_id>/', views.cost_code_rules_api, name='cost_code_rule_detail_api'),

    path('api/rules/member-mark-assignment/<uuid:project_id>/', views.member_mark_assignment_rules_api, name='member_mark_assignment_rules_api'),
    path('api/rules/member-mark-assignment/<uuid:project_id>/<uuid:rule_id>/', views.member_mark_assignment_rules_api, name='member_mark_assignment_rule_detail_api'),
    
    path('api/rules/cost-code-assignment/<uuid:project_id>/', views.cost_code_assignment_rules_api, name='cost_code_assignment_rules_api'),
    path('api/rules/cost-code-assignment/<uuid:project_id>/<uuid:rule_id>/', views.cost_code_assignment_rules_api, name='cost_code_assignment_rule_detail_api'),

    # --- 데이터 관리 API ---
    path('api/cost-codes/<uuid:project_id>/', views.cost_codes_api, name='cost_codes_api'),
    path('api/cost-codes/<uuid:project_id>/<uuid:code_id>/', views.cost_codes_api, name='cost_code_detail_api'),
    
    path('api/member-marks/<uuid:project_id>/', views.member_marks_api, name='member_marks_api'),
    path('api/member-marks/<uuid:project_id>/<uuid:mark_id>/', views.member_marks_api, name='member_mark_detail_api'),

    path('api/quantity-members/<uuid:project_id>/', views.quantity_members_api, name='quantity_members_api'),
    path('api/quantity-members/<uuid:project_id>/<uuid:member_id>/', views.quantity_members_api, name='quantity_member_detail_api'),
    path('api/quantity-members/auto-create/<uuid:project_id>/', views.create_quantity_members_auto_view, name='create_quantity_members_auto'),
    path('api/quantity-members/manage-cost-codes/<uuid:project_id>/', views.manage_quantity_member_cost_codes_api, name='manage_qm_cost_codes'),
    path('api/quantity-members/manage-member-marks/<uuid:project_id>/', views.manage_quantity_member_member_marks_api, name='manage_qm_member_marks'),
    path('api/quantity-members/apply-assignment-rules/<uuid:project_id>/', views.apply_assignment_rules_view, name='apply_assignment_rules'),
    
    path('api/cost-items/<uuid:project_id>/', views.cost_items_api, name='cost_items_api'),
    path('api/cost-items/<uuid:project_id>/<uuid:item_id>/', views.cost_items_api, name='cost_item_detail_api'),
    path('api/cost-items/auto-create/<uuid:project_id>/', views.create_cost_items_auto_view, name='create_cost_items_auto'),
    
    # --- BOQ API ---
    path('api/boq/grouping-fields/<uuid:project_id>/', views.get_boq_grouping_fields_api, name='get_boq_grouping_fields'),
    path('api/boq/report/<uuid:project_id>/', views.generate_boq_report_api, name='generate_boq_report'),
]