import os
import re
import subprocess
from pathlib import Path

# 설정
REQUESTS_DIR = "docs/REQUESTS"
PENDING_FILE = "PENDING.md"

# PENDING 파일 기본 내용
REQUEST_PENDING_CONTENT = "# [PENDING] 다음 요청사항\n\n- (여기에 다음 작업에 대한 사용자 요청을 기록합니다)\n"

def get_latest_commit_info():
    """최신 커밋의 제목과 날짜를 가져옵니다."""
    try:
        result = subprocess.check_output(
            ["git", "log", "-1", "--pretty=format:%s|%ad", "--date=format:%Y-%m-%d"],
            encoding='utf-8',
            stderr=subprocess.STDOUT
        ).strip()
        subject, date = result.split('|', 1)
        return subject, date
    except Exception as e:
        print(f"[오류] 마지막 커밋 정보를 가져오는 중 예외 발생: {e}")
        return None, None

def get_next_request_number(directory: Path):
    """디렉터리 내 파일명을 분석하여 다음 순번을 결정합니다."""
    max_num = 0
    for f in directory.glob("*.md"):
        match = re.match(r'^\\[(\\d+)\\]', f.name)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return max_num + 1

def sanitize_filename(name):
    """파일 이름으로 사용할 수 없는 문자를 제거합니다."""
    return re.sub(r'[\\/*?"<>|:]', '-', name)

def main():
    base_dir = Path(__file__).resolve().parent.parent
    requests_dir_path = base_dir / REQUESTS_DIR
    pending_filepath = requests_dir_path / PENDING_FILE

    subject, date = get_latest_commit_info()
    if not subject or not date:
        print("[오류] 커밋 정보를 찾을 수 없어 REQUESTS 업데이트를 건너<binary data, 1 bytes><binary data, 2 bytes><binary data, 3 bytes>니다.")
        return

    # 1. docs/REQUESTS/PENDING.md 파일 이름 변경
    if pending_filepath.exists():
        next_num = get_next_request_number(requests_dir_path)
        new_filename = f"[{next_num:03d}] {date} — {sanitize_filename(subject)}.md"
        new_filepath = requests_dir_path / new_filename
        try:
            pending_filepath.rename(new_filepath)
            print(f"[성공] REQUESTS/PENDING.md -> {new_filename}으로 변경했습니다.")

            # 2. 새로운 PENDING.md 파일 생성
            pending_filepath.write_text(REQUEST_PENDING_CONTENT, encoding='utf-8')
            print(f"[성공] 새로운 REQUESTS/PENDING.md 파일을 생성했습니다.")
        except Exception as e:
            print(f"[오류] PENDING.md 파일 처리 중 오류 발생: {e}")
    else:
        print("[정보] REQUESTS/PENDING.md 파일이 없어 이름 변경 및 재생성을 건너<binary data, 1 bytes><binary data, 2 bytes><binary data, 3 bytes>니다.")

if __name__ == "__main__":
    main()