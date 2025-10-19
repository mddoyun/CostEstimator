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
    path('api/rules/space-classification/<uuid:project_id>/', views.space_classification_rules_api, name='space_classification_rules_api'),
    path('api/rules/space-classification/<uuid:project_id>/<uuid:rule_id>/', views.space_classification_rules_api, name='space_classification_rule_detail_api'),

    # --- 데이터 관리 API ---
    path('api/cost-codes/<uuid:project_id>/', views.cost_codes_api, name='cost_codes_api'),
    path('api/cost-codes/<uuid:project_id>/<uuid:code_id>/', views.cost_codes_api, name='cost_code_detail_api'),
    path('api/cost-codes/<uuid:project_id>/export/', views.export_cost_codes, name='export_cost_codes'),
    path('api/cost-codes/<uuid:project_id>/import/', views.import_cost_codes, name='import_cost_codes'),

    path('api/member-marks/<uuid:project_id>/', views.member_marks_api, name='member_marks_api'),
    path('api/member-marks/<uuid:project_id>/<uuid:mark_id>/', views.member_marks_api, name='member_mark_detail_api'),

    path('api/member-marks/<uuid:project_id>/export/', views.export_member_marks, name='export_member_marks'),
    path('api/member-marks/<uuid:project_id>/import/', views.import_member_marks, name='import_member_marks'),


    path('api/quantity-members/<uuid:project_id>/', views.quantity_members_api, name='quantity_members_api'),
    path('api/quantity-members/<uuid:project_id>/<uuid:member_id>/', views.quantity_members_api, name='quantity_member_detail_api'),
    path('api/quantity-members/auto-create/<uuid:project_id>/', views.create_quantity_members_auto_view, name='create_quantity_members_auto'),
    path('api/quantity-members/manage-cost-codes/<uuid:project_id>/', views.manage_quantity_member_cost_codes_api, name='manage_qm_cost_codes'),
    path('api/quantity-members/manage-member-marks/<uuid:project_id>/', views.manage_quantity_member_member_marks_api, name='manage_qm_member_marks'),
    path('api/quantity-members/manage-spaces/<uuid:project_id>/', views.manage_quantity_member_spaces_api, name='manage_qm_spaces'),


    path('api/quantity-members/apply-assignment-rules/<uuid:project_id>/', views.apply_assignment_rules_view, name='apply_assignment_rules'),

    path('api/cost-items/<uuid:project_id>/', views.cost_items_api, name='cost_items_api'),
    path('api/cost-items/<uuid:project_id>/<uuid:item_id>/', views.cost_items_api, name='cost_item_detail_api'),
    path('api/cost-items/auto-create/<uuid:project_id>/', views.create_cost_items_auto_view, name='create_cost_items_auto'),

    # --- BOQ API ---
    path('api/boq/grouping-fields/<uuid:project_id>/', views.get_boq_grouping_fields_api, name='get_boq_grouping_fields'),
    path('api/boq/report/<uuid:project_id>/', views.generate_boq_report_api, name='generate_boq_report'),
    path('api/boq/update-unit-price-type/<uuid:project_id>/', views.update_cost_item_unit_price_type, name='update_cost_item_unit_price_type'),
    # ▼▼▼ [추가] 이 아래에 새로운 URL 경로를 추가해주세요. ▼▼▼
    # --- 공간분류 API ---
    path('api/space-classifications/<uuid:project_id>/', views.space_classifications_api, name='space_classifications_api'),
    path('api/space-classifications/<uuid:project_id>/<uuid:sc_id>/', views.space_classifications_api, name='space_classification_detail_api'),
    path('api/space-classifications/<uuid:project_id>/export/', views.export_space_classifications, name='export_space_classifications'),
    path('api/space-classifications/<uuid:project_id>/import/', views.import_space_classifications, name='import_space_classifications'),


    path('api/space-classifications/manage-elements/<uuid:project_id>/', views.manage_space_element_mapping_api, name='manage_space_element_mapping_api'),

    path('api/space-classifications/<uuid:project_id>/<uuid:sc_id>/elements/', views.get_space_mapped_elements_api, name='get_space_mapped_elements'),
    path('api/space-classifications/apply-rules/<uuid:project_id>/', views.apply_space_classification_rules_view, name='apply_space_classification_rules'),
    path('api/rules/space-assignment/<uuid:project_id>/', views.space_assignment_rules_api, name='space_assignment_rules_api'),
    path('api/rules/space-assignment/<uuid:project_id>/<uuid:rule_id>/', views.space_assignment_rules_api, name='space_assignment_rule_detail_api'),

    # --- 룰셋 가져오기/내보내기 ---
    path('api/rules/classification/<uuid:project_id>/export/', views.export_classification_rules, name='export_classification_rules'),
    path('api/rules/classification/<uuid:project_id>/import/', views.import_classification_rules, name='import_classification_rules'),

    path('api/rules/property-mapping/<uuid:project_id>/export/', views.export_property_mapping_rules, name='export_property_mapping_rules'),
    path('api/rules/property-mapping/<uuid:project_id>/import/', views.import_property_mapping_rules, name='import_property_mapping_rules'),

    path('api/rules/cost-code/<uuid:project_id>/export/', views.export_cost_code_rules, name='export_cost_code_rules'),
    path('api/rules/cost-code/<uuid:project_id>/import/', views.import_cost_code_rules, name='import_cost_code_rules'),

    path('api/rules/member-mark-assignment/<uuid:project_id>/export/', views.export_member_mark_assignment_rules, name='export_member_mark_assignment_rules'),
    path('api/rules/member-mark-assignment/<uuid:project_id>/import/', views.import_member_mark_assignment_rules, name='import_member_mark_assignment_rules'),

    path('api/rules/cost-code-assignment/<uuid:project_id>/export/', views.export_cost_code_assignment_rules, name='export_cost_code_assignment_rules'),
    path('api/rules/cost-code-assignment/<uuid:project_id>/import/', views.import_cost_code_assignment_rules, name='import_cost_code_assignment_rules'),

    path('api/rules/space-classification/<uuid:project_id>/export/', views.export_space_classification_rules, name='export_space_classification_rules'),
    path('api/rules/space-classification/<uuid:project_id>/import/', views.import_space_classification_rules, name='import_space_classification_rules'),

    path('api/rules/space-assignment/<uuid:project_id>/export/', views.export_space_assignment_rules, name='export_space_assignment_rules'),
    path('api/rules/space-assignment/<uuid:project_id>/import/', views.import_space_assignment_rules, name='import_space_assignment_rules'),

    # --- 프로젝트 가져오기/내보내기 ---
    path('export-project/<uuid:project_id>/', views.export_project, name='export_project'),
    path('import-project/', views.import_project, name='import_project'),

    # --- 단가 관리 API ---
    path('api/unit-price-types/<uuid:project_id>/', views.unit_price_types_api, name='unit_price_types_api'),
    path('api/unit-price-types/<uuid:project_id>/<uuid:type_id>/', views.unit_price_types_api, name='unit_price_type_detail_api'),

    path('api/unit-prices/<uuid:project_id>/<uuid:cost_code_id>/', views.unit_prices_api, name='unit_prices_api'),
    path('api/unit-prices/<uuid:project_id>/<uuid:cost_code_id>/<uuid:price_id>/', views.unit_prices_api, name='unit_price_detail_api'),

    # ▼▼▼ [추가] AI 모델 관리 API ▼▼▼
    path('api/ai-models/<uuid:project_id>/', views.ai_models_api, name='ai_models_api'),
    path('api/ai-models/<uuid:project_id>/<uuid:model_id>/', views.ai_models_api, name='ai_model_detail_api'),
    path('api/ai-models/<uuid:project_id>/<uuid:model_id>/download/', views.download_ai_model, name='download_ai_model'),    # ▲▲▲ [추가] 여기까지 ▲▲▲

    # ▼▼▼ [추가] AI 모델 학습 API ▼▼▼
    path('api/ai-training/<uuid:project_id>/upload-csv/', views.upload_training_csv, name='upload_training_csv'),
    path('api/ai-training/<uuid:project_id>/start/', views.start_ai_training, name='start_ai_training'),
    path('api/ai-models/<uuid:project_id>/save-trained/', views.save_trained_model_api, name='save_trained_model_api'), # <<< 여기가 올바른 위치
    # ▼▼▼ [추가] 개산견적(SD) API ▼▼▼
    path('api/sd/cost-codes/<uuid:project_id>/', views.get_sd_cost_codes_with_quantity, name='get_sd_cost_codes'),
    path('api/sd/predict/<uuid:project_id>/<uuid:model_id>/', views.predict_sd_cost, name='predict_sd_cost'),
    path('api/sd/cost-items/<uuid:project_id>/', views.get_sd_cost_items, name='get_sd_cost_items'),
    # ▲▲▲ [추가] 여기까지 ▲▲▲
    path('api/ai-training/download-temp/', views.download_temp_file_api, name='download_temp_file_api'),
]