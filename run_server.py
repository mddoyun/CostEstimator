# mddoyun/costestimator/CostEstimator-62a4e4e.../run_server.py

import os
import sys
import shutil
from pathlib import Path

# [핵심] Django의 핵심 실행 함수를 직접 가져옵니다.
from django.core.management import execute_from_command_line

def main():
    """
    이 스크립트는 PyInstaller로 빌드된 단일 콘솔 실행 파일의 진입점입니다.
    subprocess 없이 직접 Django 서버를 구동합니다.
    """
    # --- 1. 쓰기 가능한 데이터 폴더 설정 ---
    try:
        writable_dir = Path.home() / "CostEstimator_Data"
        writable_dir.mkdir(exist_ok=True)
        print(f"✅ 데이터 폴더 확인: {writable_dir}")
    except Exception as e:
        print(f"❌ 오류: 데이터 폴더를 생성할 수 없습니다. {e}")
        input("엔터 키를 눌러 종료하세요...")
        sys.exit(1)

    # --- 2. 초기 데이터베이스 복사 ---
    db_path = writable_dir / "db.sqlite3"
    if not db_path.exists():
        try:
            # PyInstaller로 빌드된 경우, _MEIPASS 가상 경로에서 파일을 찾습니다.
            if getattr(sys, 'frozen', False):
                source_db_path = Path(sys._MEIPASS) / "db.sqlite3"
            else:
                source_db_path = Path(__file__).parent / "db.sqlite3"

            if source_db_path.exists():
                shutil.copy2(source_db_path, db_path)
                print("✅ 초기 데이터베이스를 데이터 폴더로 복사했습니다.")
                
            else:
                print("⚠️ 경고: 원본 데이터베이스 파일(db.sqlite3)을 찾을 수 없습니다.")
        except Exception as e:
            print(f"❌ 오류: 데이터베이스 복사 중 문제가 발생했습니다. {e}")
            input("엔터 키를 눌러 종료하세요...")
            sys.exit(1)
            
    # --- 3. Django 환경 설정 ---
    # Django가 db.sqlite3를 찾을 수 있도록 현재 프로세스의 작업 디렉토리를 변경합니다.
    os.chdir(writable_dir)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'aibim_quantity_takeoff_web.settings')

    try:
        # --- 4. 데이터베이스 마이그레이션 실행 ---
        print("\n--- 데이터베이스 마이그레이션 시작 ---")
        # sys.argv를 일시적으로 조작하여 'migrate' 명령어를 실행합니다.
        execute_from_command_line([sys.argv[0], 'migrate'])
        print("--- 데이터베이스 마이그레이션 완료 ---\n")

        # --- 5. Django 서버 실행 ---
        print("🚀 Django 서버를 시작합니다. (http://127.0.0.1:8000)")
        print("서버를 종료하려면 이 창에서 Ctrl+C 를 누르세요.")
        
        # sys.argv를 다시 조작하여 'runserver' 명령어를 실행합니다.
        # '--noreload' 옵션은 PyInstaller 환경에서 필수적입니다.
        execute_from_command_line([sys.argv[0], 'runserver', '--noreload'])

    except KeyboardInterrupt:
        print("\n🛑 서버 종료 명령을 받았습니다. 프로그램을 종료합니다.")
    except Exception as e:
        print(f"❌ 오류: Django 실행 중 문제가 발생했습니다: {e}")
        # 오류 발생 시 상세 정보를 위해 traceback 출력
        import traceback
        traceback.print_exc()
        input("엔터 키를 눌러 종료하세요...")
    finally:
        sys.exit(0)

if __name__ == '__main__':
    main()


"""
빌드방법(mac os)

pyinstaller --name "CostEstimatorServer" \
--onefile \
--add-data "db.sqlite3:." \
--add-data "aibim_quantity_takeoff_web:aibim_quantity_takeoff_web" \
--add-data "connections:connections" \
run_server.py

"""

"""
빌드방법(윈도우) - 터미널에서 실행(cmd

pyinstaller --name "CostEstimatorServer" --onefile --add-data "db.sqlite3:." --add-data "aibim_quantity_takeoff_web:aibim_quantity_takeoff_web" --add-data "connections:connections" run_server.py
"""
