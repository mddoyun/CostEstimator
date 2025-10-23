# 코드맵 (CODEMAP.md)

이 문서는 프로젝트의 전체 코드 구조와 각 모듈의 역할을 요약합니다. 코드 변경 시 반드시 해당 내용을 1~2줄로 갱신해야 합니다.

## 프로젝트 구조

-   **`manage.py`**: Django 프로젝트 관리 스크립트.
-   **`run_server.py`**: PyInstaller 빌드를 위한 엔트리 포인트 및 서버 실행 스크립트.
-   **`aibim_quantity_takeoff_web/`**: Django 프로젝트의 메인 설정 디렉터리.
    -   `settings.py`: 프로젝트 설정.
    -   `urls.py`: 최상위 URL 라우팅.
    -   `asgi.py` / `wsgi.py`: 서버 연동 인터페이스.
-   **`connections/`**: 핵심 기능이 구현된 Django 앱.
    -   `views.py`: 대부분의 백엔드 로직, API 뷰 함수 포함. AI 모델 학습 및 예측 기능(`run_ai_training_task`, `predict_sd_cost`)이 여기에 정의되어 있습니다.
    -   `models.py`: 데이터베이스 모델(테이블) 정의.
    -   `urls.py`: `connections` 앱 내부의 URL 라우팅.
    -   `consumers.py`: Django Channels를 사용한 WebSocket 통신 로직.
    -   `templates/`: HTML 템플릿 파일.
        -   `revit_control.html`: 메인 UI 페이지.
    -   `static/`: CSS, JavaScript 파일.
        -   `main.js`: 메인 프런트엔드 로직, 이벤트 핸들러.
        -   `ui.js`: UI 렌더링 및 동적 업데이트 관련 함수.
        -   `websocket.js`: WebSocket 연결 및 메시지 처리.
-   **`references/`**: 학습용 데이터 등 참조 파일.
-   **`temp_uploads/`**: 파일 업로드 시 임시 저장 공간.