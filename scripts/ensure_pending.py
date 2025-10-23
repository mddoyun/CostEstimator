import os
from pathlib import Path

# 기본 PENDING 파일 내용
REQUEST_PENDING_CONTENT = "# [PENDING] 다음 요청사항\n\n- (여기에 다음 작업에 대한 사용자 요청을 기록합니다)\n"
WORKLOG_PENDING_CONTENT = "# [PENDING] 현재 작업 로그\n\n## 변경 요약\n- (무엇을 변경했는지 간략히 요약)\n\n## 문제 원인\n- (왜 이 변경이 필요했는지 원인 기술)\n\n## 해결 방안\n- (어떻게 문제를 해결했는지 기술)\n\n## 참고\n- (기타 참고사항)\n"

def ensure_pending_file(directory: Path, content: str):
    """특정 디렉터리 내 PENDING.md 파일의 존재를 확인하고, 없으면 생성"""
    pending_file = directory / "PENDING.md"
    pending_files = list(directory.glob("PENDING*.md"))

    if len(pending_files) > 1:
        print(f"[오류] {directory}에 PENDING 파일이 두 개 이상 존재합니다. 하나만 남겨주세요.")
        return False
    
    if not pending_files:
        print(f"[정보] {directory}에 PENDING 파일이 없어 새로 생성합니다.")
        pending_file.write_text(content, encoding='utf-8')
    
    return True

def main():
    base_dir = Path(__file__).resolve().parent.parent
    requests_dir = base_dir / "docs" / "REQUESTS"
    worklogs_dir = base_dir / "docs" / "WORKLOGS"

    # 디렉터리가 없으면 생성
    requests_dir.mkdir(exist_ok=True)
    worklogs_dir.mkdir(exist_ok=True)

    print("--- PENDING 파일 상태 검사 시작 ---")
    requests_ok = ensure_pending_file(requests_dir, REQUEST_PENDING_CONTENT)
    worklogs_ok = ensure_pending_file(worklogs_dir, WORKLOG_PENDING_CONTENT)

    if not requests_ok or not worklogs_ok:
        print("--- PENDING 파일 상태 검사 실패 ---")
        exit(1)
    
    print("--- PENDING 파일 상태 검사 완료 ---")

if __name__ == "__main__":
    main()