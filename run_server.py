# run_server.py (인코딩 문제 해결 최종 버전)
# run_server.py (최종 안정화 버전)

import os
import sys
import shutil
from pathlib import Path
from django.core.management import execute_from_command_line

def main():
    """
    This script is the entry point for the PyInstaller bundled executable.
    It handles all tasks for setting up and running the Django server without subprocesses.
    """
    # --- 1. Setup writable data folder ---
    try:
        writable_dir = Path.home() / "CostEstimator_Data"
        writable_dir.mkdir(exist_ok=True)
        print(f"[OK] Data folder checked: {writable_dir}")
    except Exception as e:
        print(f"[ERROR] Could not create data folder: {e}")
        input("Press Enter to exit...")
        sys.exit(1)

    # --- 2. Copy initial database ---
    db_path = writable_dir / "db.sqlite3"
    if not db_path.exists():
        try:
            if getattr(sys, 'frozen', False):
                source_db_path = Path(sys._MEIPASS) / "db.sqlite3"
            else:
                source_db_path = Path(__file__).parent / "db.sqlite3"

            if source_db_path.exists():
                shutil.copy2(source_db_path, db_path)
                print("[OK] Initial database copied.")
            else:
                print("[WARNING] Original database file (db.sqlite3) not found.")
        except Exception as e:
            print(f"[ERROR] Failed to copy database: {e}")
            input("Press Enter to exit...")
            sys.exit(1)
            
    # --- 3. Configure Django environment ---
    os.chdir(writable_dir)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'aibim_quantity_takeoff_web.settings')

    try:
        # --- 4. Run database migration ---
        print("\n--- Starting database migration ---")
        execute_from_command_line([sys.argv[0], 'migrate'])
        print("--- Database migration complete ---\n")

        # --- 5. Run Django server ---
        print("[INFO] Starting Django server at http://127.0.0.1:8000")
        print("[INFO] Press Ctrl+C in this window to stop the server.")
        
        execute_from_command_line([sys.argv[0], 'runserver', '--noreload'])

    except KeyboardInterrupt:
        print("\n[INFO] Server shutdown command received. Exiting.")
    except Exception as e:
        print(f"[FATAL ERROR] An error occurred while running Django: {e}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")
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

pyinstaller --name "CostEstimatorServer" --onefile --add-data "db.sqlite3;." --add-data "aibim_quantity_takeoff_web;aibim_quantity_takeoff_web" --add-data "connections;connections" run_server.py

"""
