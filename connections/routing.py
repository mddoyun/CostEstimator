# connections/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
	# 기존 Revit 커넥터용 URL
	re_path(r'ws/revit-connector/$', consumers.RevitConsumer.as_asgi()),
	# ◀◀◀ 프론트엔드용 URL 새로 추가
	re_path(r'ws/frontend/$', consumers.FrontendConsumer.as_asgi()),
]