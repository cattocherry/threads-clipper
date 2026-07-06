# RETHREAD

Threads에서 저장하거나 리포스트한 글을 다시 찾기 쉽게 보관하는 local-first 아카이브입니다. 사용자 데이터는 서버에 저장하지 않고 각 브라우저의 IndexedDB에 저장합니다.

## 기능

- Threads 링크 붙여넣기 즉시 로컬 저장
- OG 메타데이터 수집, 실패해도 URL만으로 저장 유지
- Claude 기반 태그 제안, 사용자가 확정하기 전까지 DB에 저장하지 않음
- 상태 축: 나중에 볼 것 / 읽는 중 / 다 봄
- 태그 축: 자유 태그, 다중 AND 필터
- 다시보기: 읽다 만 글, 오늘의 발견, 그때 그 글
- JSON 내보내기/가져오기, threads-clipper v1 JSON 마이그레이션

## 로컬 실행

```bash
npm install
npm run dev
```

태그 제안을 쓰려면 `.env.local`에 서버 전용 키를 넣습니다.

```bash
ANTHROPIC_API_KEY=...
```

키가 없어도 앱은 동작하며 태그 제안만 빈 배열로 fallback 됩니다.

## Vercel 배포

Vercel 프로젝트 환경변수에 `ANTHROPIC_API_KEY`를 설정하면 `/api/suggest-tags`가 활성화됩니다. 사용자 아카이브 데이터는 Vercel이나 Upstash에 저장되지 않습니다.

Framework Preset은 Next.js를 사용합니다.
