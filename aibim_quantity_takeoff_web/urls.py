# aibim_quantity_takeoff_web/urls.py
from django.contrib import admin
from django.urls import path, include

# connections 앱의 views를 가져오기 위한 import 문을 추가합니다.
from connections import views as connection_views

urlpatterns = [
    # 루트 URL('')로 접속 시 connection_views.revit_control_panel을 실행하도록 경로를 추가합니다.
    path('', connection_views.revit_control_panel, name='home'),
    
    # 기존 경로들은 그대로 유지합니다.
    path('admin/', admin.site.urls),
    path('connections/', include('connections.urls')),
]