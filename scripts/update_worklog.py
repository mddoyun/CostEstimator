import os
import re
import subprocess
from pathlib import Path

WORKLOG_PATH = "docs/WORKLOG.md"
WORKLOGS_DIR = "docs/WORKLOGS"
PENDING_FILE = "PENDING.md"

# PENDING 파일 기본 내용
WORKLOG_PENDING_CONTENT = """# [PENDING] 현재 작업 로그

## 변경 요약
- (무엇을 변경했는지 간략히 요약)

## 문제 원인
- (왜 이 변경이 필요했는지 원인 기술)

## 해결 방안
- (어떻게 문제를 해결했는지 기술)

## 참고
- (기타 참고사항)
"""

def get_latest_commit_info():
    """최신 커밋의 해시와 제목을 가져옵니다."""
    try:
        result_bytes = subprocess.check_output(
            ["git", "log", "-1", "--pretty=format:%H|%s"],
            stderr=subprocess.STDOUT
        )
        try:
            result = result_bytes.decode('utf-8').strip()
        except UnicodeDecodeError:
            result = result_bytes.decode('cp949', errors='replace').strip()
            
        commit_hash, subject = result.split('|', 1)
        return commit_hash, subject
    except subprocess.CalledProcessError as e:
        print(f"[오류] Git 로그를 가져오는 데 실패했습니다: {e.output}")
        return None, None
    except Exception as e:
        print(f"[오류] 마지막 커밋 정보를 가져오는 중 예외 발생: {e}")
        return None, None

def sanitize_filename(name):
    """파일 이름으로 사용할 수 없는 문자를 제거합니다."""
    return re.sub(r'[\\/*?"<>|:]', '-', name)

def main():
    base_dir = Path(__file__).resolve().parent.parent
    worklog_md_path = base_dir / WORKLOG_PATH
    worklogs_dir_path = base_dir / WORKLOGS_DIR
    pending_filepath = worklogs_dir_path / PENDING_FILE

    commit_hash, subject = get_latest_commit_info()
    if not commit_hash or not subject:
        print("[오류] 커밋 정보를 찾을 수 없어 WORKLOG 업데이트를 건너<binary data, 1 bytes><binary data, 2 bytes><binary data, 3 bytes>니다.")
        return

    print(f"최신 커밋: {subject} ({commit_hash[:7]})")

    # 1. docs/WORKLOG.md 파일 업데이트
    try:
        with open(worklog_md_path, 'r+', encoding='utf-8') as f:
            lines = f.readlines()
            # 마지막 줄의 No. 가져오기
            last_line = lines[-1].strip()
            last_num = 0
            if last_line and last_line.startswith('|'):
                try:
                    last_num = int(last_line.split('|')[1].strip())
                except (ValueError, IndexError):
                    last_num = 0 # 숫자를 찾지 못하면 0부터 시작
            
            new_num = last_num + 1
            commit_date = subprocess.check_output(
                ["git", "log", "-1", "--pretty=format:%ad", "--date=format:%Y-%m-%d"],
                encoding='utf-8'
            ).strip()

            new_line = f"| {new_num} | {commit_date} | {subject} | {commit_hash[:7]} |\n"

            # 중복 추가 방지
            if any(commit_hash[:7] in line for line in lines):
                print("[정보] WORKLOG.md에 이미 해당 커밋이 존재합니다. 업데이트를 건너<binary data, 1 bytes><binary data, 2 bytes><binary data, 3 bytes>니다.")
            else:
                f.write(new_line)
                print(f"[성공] WORKLOG.md에 새 커밋 로그를 추가했습니다: {new_line.strip()}")

    except FileNotFoundError:
        print(f"[오류] {worklog_md_path} 파일을 찾을 수 없습니다.")
    except Exception as e:
        print(f"[오류] WORKLOG.md 업데이트 중 오류 발생: {e}")

    # 2. docs/WORKLOGS/PENDING.md 파일 이름 변경
    if pending_filepath.exists():
        new_filename = f"{sanitize_filename(subject)}.md"
        new_filepath = worklogs_dir_path / new_filename
        try:
            pending_filepath.rename(new_filepath)
            print(f"[성공] WORKLOGS/PENDING.md -> {new_filename}으로 변경했습니다.")

            # 3. 새로운 PENDING.md 파일 생성
            pending_filepath.write_text(WORKLOG_PENDING_CONTENT, encoding='utf-8')
            print(f"[성공] 새로운 WORKLOGS/PENDING.md 파일을 생성했습니다.")
        except Exception as e:
            print(f"[오류] PENDING.md 파일 처리 중 오류 발생: {e}")
    else:
        print("[정보] WORKLOGS/PENDING.md 파일이 없어 이름 변경 및 재생성을 건너<binary data, 1 bytes><binary data, 2 bytes><binary data, 3 bytes>니다.")

if __name__ == "__main__":
    main()