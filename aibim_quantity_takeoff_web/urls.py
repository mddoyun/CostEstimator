# aibim_quantity_takeoff_web/urls.py
from django.contrib import admin
from django.urls import path, include
from connections import views as connection_views

urlpatterns = [
    path('', connection_views.revit_control_panel, name='home'),
    path('admin/', admin.site.urls),
    # ▼▼▼ [핵심] 이 줄이 빠져있거나 잘못 설정되어 있는지 확인하세요. ▼▼▼
    path('connections/', include('connections.urls')), 
]