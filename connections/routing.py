# connections/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
	# 기존 Revit 커넥터용 URL
	re_path(r'ws/revit-connector/$', consumers.RevitConsumer.as_asgi()),
	# 프론트엔드용 URL
	re_path(r'ws/frontend/$', consumers.FrontendConsumer.as_asgi()),
    # ▼▼▼ [추가] Blender 커넥터용 URL을 추가합니다. ▼▼▼
	re_path(r'ws/blender-connector/$', consumers.RevitConsumer.as_asgi()),
]