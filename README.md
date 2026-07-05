# Threads Clipper

개인용 Threads 링크 클리핑 앱입니다. 페블툰 아카이브와 같은 Vercel + Upstash 구조를 쓰지만, 저장 키는 `clips`라 기존 아카이브 데이터와 섞이지 않습니다.

## 기능

- Threads 링크 여러 개 일괄 저장
- `og:title`, `og:image` 자동 추출
- 태그, 메모, 상태 저장
- 제목/메모/태그 검색
- 상태/태그 필터
- 관리자 비밀번호로 추가, 수정, 삭제

## 환경변수

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `ADMIN_PASSWORD`

Upstash/Vercel KV 연결을 쓰면 위 값들이 자동으로 들어갑니다.
