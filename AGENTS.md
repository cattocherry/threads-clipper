# AGENTS.md — RETHREAD 구현 에이전트 지침 (v2)

> 이 파일은 Codex / Antigravity 에이전트가 프로젝트 전반에서 항상 준수해야 할 규칙이다.
> 제품 스펙은 `SPEC.md` 참조. 단계별 작업은 `IMPLEMENTATION_PROMPTS.md`의 프롬프트를 순서대로 수행.

## 절대 규칙

1. **사용자 데이터는 오직 브라우저 IndexedDB에만 저장한다.** 서버(API Route)는 어떤 사용자 데이터도 저장·로깅하지 않는다. 무상태 프록시 역할만 한다. 공유 저장소(Gist 등)와 관리자 모드는 도입하지 않는다.
2. **API 키는 서버 환경변수로만 접근한다.** `ANTHROPIC_API_KEY`를 클라이언트 번들에 절대 노출하지 않는다 (`NEXT_PUBLIC_` 접두어 금지).
3. **저장은 절대 실패하지 않는다.** OG 스크래핑이나 태그 제안이 실패해도 URL만으로 항목 저장이 완료돼야 한다. 외부 호출 실패는 UI에서 조용히 fallback 처리.
4. **모든 IndexedDB 접근은 `lib/repository.ts` 를 통해서만 한다.** 컴포넌트에서 Dexie 직접 호출 금지 (향후 Supabase 동기화 어댑터 교체를 위한 추상화).
5. **태그는 항상 사용자가 최종 결정한다.** AI 제안 태그는 확정 전까지 저장되지 않고, 확정 후에도 편집 가능해야 한다.
6. **상태(status)와 태그(tags)는 독립된 축이다.** 상태 변경이 태그를 건드리거나 그 반대가 일어나는 로직을 만들지 않는다. 유일한 자동 상태 전이는 "원본 링크 열기 시 later→reading" 하나뿐이며, done 전환은 반드시 사용자 명시 액션이어야 한다.

## 기술 스택 (고정 — 임의 변경 금지)

- Next.js 14+ App Router, TypeScript strict
- Dexie.js (IndexedDB)
- Tailwind CSS
- @anthropic-ai/sdk (서버 전용), 모델: `claude-haiku-4-5`
- nanoid (id 생성)
- 배포: Vercel

## 코드 컨벤션

- 컴포넌트: `components/` 하위, 함수형 + 훅
- 데이터 로직: `lib/repository.ts` (CRUD), `lib/db.ts` (Dexie 스키마), `lib/types.ts`
- API: `app/api/og/route.ts`, `app/api/suggest-tags/route.ts`
- 상태관리: React 훅 + Dexie `useLiveQuery` (외부 상태 라이브러리 도입 금지)
- UI 텍스트는 한국어. 상태 표시명: later="나중에 볼 것", reading="읽는 중", done="다 봄"
- 상태 색상 토큰: later=회색, reading=파랑, done=초록, 즐겨찾기=노랑 (Tailwind 팔레트에서 일관 사용)
- 에러는 사용자에게 토스트로 짧게, 콘솔에 상세히

## 검증 기준 (각 단계 완료 조건)

- `npm run build` 무경고 통과
- 오프라인 상태에서도 저장(URL만)·조회·검색·상태 변경·백업이 동작
- 새로고침 후 데이터 유지 확인
- 모바일 뷰포트(390px)에서 레이아웃 깨짐 없음

## 금지 사항

- HTML `<form>` 제출 방식 대신 onClick/onChange 핸들러 사용
- localStorage에 아카이브 데이터 저장 금지 (IndexedDB만 사용; localStorage는 UI 설정값 정도만 허용)
- 외부 UI 킷(MUI, Chakra 등) 도입 금지 — Tailwind로 직접 구현
- Threads 비공식 API·스크래핑 라이브러리 도입 금지 — OG 메타태그 파싱만 사용
