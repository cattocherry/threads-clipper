# IMPLEMENTATION_PROMPTS.md — 단계별 구현 프롬프트 (v2)

> 각 프롬프트를 순서대로 Codex / Antigravity에 붙여넣는다.
> 각 단계는 독립적으로 빌드 가능한 상태로 끝난다. `AGENTS.md`와 `SPEC.md`가 프로젝트 루트에 있어야 한다.
> v2 변경점: 읽기 상태(status) 축 통합, v1(threads-clipper) 데이터 마이그레이션 추가.

---

## PHASE 1 — 프로젝트 골격 + 데이터 계층

```
SPEC.md와 AGENTS.md를 먼저 읽어라.

Next.js 14 App Router + TypeScript strict + Tailwind 프로젝트를 생성하고 다음을 구현하라.

1. lib/types.ts — SPEC.md 3장의 ReadStatus, ArchiveItem, TagMeta 타입 정의
2. lib/db.ts — Dexie 스키마. 테이블: items (인덱스: id, savedAt, status, isClassified, isFavorite, *tags), tagMeta (인덱스: name)
3. lib/repository.ts — 모든 데이터 접근의 단일 창구. 구현 함수:
   - addItem(partial: {url, author?, previewText?, thumbnail?}): OG 실패 대비 url만으로도 생성 가능. 기본값 isClassified=false, status='later', statusChangedAt=savedAt=Date.now(), id=nanoid()
   - updateItem(id, patch) / deleteItem(id)
   - setStatus(id, status: ReadStatus): status + statusChangedAt 갱신. AGENTS.md 규칙 6 준수 — 태그를 건드리지 않는다
   - confirmTags(id, tags: string[]): 태그 확정 + isClassified=true + tagMeta.count 갱신 (status는 변경하지 않음)
   - getInboxItems() / getLibraryItems({status?, tags?, favoriteOnly?, sort?}): status와 tags는 AND 결합
   - searchItems(query): author, authorName, previewText, memo, tags 대상 대소문자 무시 부분일치
   - getAllTags(): count 내림차순
   - renameTag(old, new) / deleteTag(name): 전체 항목 일괄 반영
   - exportJSON(): 전체 데이터 직렬화 / importJSON(data, mode: 'merge'|'overwrite'): merge는 id 기준 중복 제거
   - getStaleReadingItems(days=7): status='reading'이고 statusChangedAt이 days일 이상 지난 항목
   - getRediscoveryItems(n): lastViewedAt 없거나 오래된 later/done 항목 우선 가중 랜덤 n개
   - markViewed(id): lastViewedAt 갱신
4. 레이아웃: 하단 탭 네비게이션 3개 (인박스 / 라이브러리 / 다시보기) + 설정 아이콘. 다크 모드 기본. 모바일 우선(max-w-lg 중앙 정렬).

빈 페이지 3개가 탭으로 전환되는 상태까지 완성하고 npm run build 통과를 확인하라.
```

---

## PHASE 2 — 서버리스 API 2종

```
AGENTS.md 절대 규칙 1, 2번을 준수하며 다음 두 API Route를 구현하라. 두 라우트 모두 어떤 데이터도 저장·로깅하지 않는 무상태 프록시다.

1. app/api/og/route.ts — POST {url}
   - url이 threads.net 또는 threads.com 도메인인지 검증 (아니면 400)
   - fetch로 HTML을 가져와 og:title, og:description, og:image 메타태그를 정규식으로 파싱
   - og:title에서 작성자 핸들 추출 (Threads의 og:title 형식: "이름 (@handle) on Threads" 패턴)
   - 응답: {author, authorName, previewText, thumbnail} — 파싱 실패 필드는 빈 문자열
   - 5초 타임아웃, 실패 시 200으로 빈 필드 반환 (클라이언트가 fallback 처리하도록)
   - User-Agent 헤더를 일반 브라우저 값으로 설정

2. app/api/suggest-tags/route.ts — POST {text, existingTags: string[]}
   - @anthropic-ai/sdk 사용, 모델 claude-haiku-4-5, max_tokens 200
   - 시스템 프롬프트: "당신은 아카이브 태그 분류기다. 주어진 글에 맞는 한국어 태그를 1~3개 제안한다. 기존 태그 목록에서 맞는 것이 있으면 반드시 그것을 우선 재사용하고, 정말 없을 때만 새 태그를 만든다. 태그는 2~6자 명사형. JSON 문자열 배열만 출력하고 다른 텍스트는 절대 포함하지 마라."
   - 응답에서 ```json 펜스 제거 후 JSON.parse, 실패 시 빈 배열 반환
   - text가 비어있으면 API 호출 없이 빈 배열 반환

.env.local.example 파일에 ANTHROPIC_API_KEY= 항목을 추가하라.
```

---

## PHASE 3 — 인박스 (저장 플로우)

```
SPEC.md 4.1을 구현하라. 이 화면이 앱의 성패를 가른다 — "저장은 3초" 원칙.

1. 상단 고정 입력창: URL 붙여넣기(onPaste) 또는 입력 후 저장 버튼
2. 저장 시퀀스 (낙관적 UI):
   a. 즉시 repository.addItem({url})로 저장 → 카드가 스켈레톤 상태로 바로 나타남 (status='later'로 생성됨)
   b. 백그라운드로 /api/og 호출 → 성공 시 updateItem으로 author/previewText/thumbnail 채움
   c. previewText가 채워지면 /api/suggest-tags 호출 (getAllTags()의 태그명들을 existingTags로 전달)
   d. 제안 태그를 카드에 점선 테두리 칩으로 표시 (미확정 상태 — DB의 tags에는 아직 저장 안 함, 컴포넌트 로컬 상태로만 유지)
3. 태그 확정 UX:
   - 점선 칩 탭 → 실선(확정 대기)으로 토글
   - 칩 옆 + 버튼 → 직접 입력 (기존 태그 자동완성 드롭다운)
   - "보관" 버튼 → confirmTags(id, 확정된 태그들) → 카드가 페이드아웃되며 인박스에서 사라짐 (라이브러리의 '나중에 볼 것'으로 들어감)
   - "나중에" 버튼 → 태그 없이 인박스에 잔류
4. 인박스 목록: isClassified=false 항목 시간 역순, useLiveQuery로 실시간 반영
5. OG 실패 항목: "정보를 가져오지 못했어요" 표시 + 작성자/내용 수동 입력 인라인 폼

빌드 통과 후, 오프라인에서 URL 저장이 실패하지 않는지 확인하라 (OG/태그 호출만 조용히 스킵되고 항목은 저장되어야 함).
```

---

## PHASE 4 — 라이브러리 (상태·태그 2축 필터 + 편집)

```
SPEC.md 4.2를 구현하라. 상태(워크플로우)와 태그(주제)는 독립된 2축 필터다.

1. 상단 검색창: 입력 시 300ms 디바운스로 repository.searchItems 호출
2. 상태 세그먼트 탭 (전체 / 나중에 볼 것 / 읽는 중 / 다 봄) — 검색창 바로 아래 항상 노출되는 1차 필터. 각 탭에 개수 뱃지 표시
3. 태그 칩 가로 스크롤 바: getAllTags() 결과, 다중 선택 = AND 필터, 선택 상태 시각 구분. 즐겨찾기 토글(별 아이콘) 별도 배치. 상태 필터와 AND 결합
4. 카드 그리드 (1열, 넓은 화면 2열): 썸네일(없으면 회색 플레이스홀더) + @작성자 + 본문 2줄 말줄임 + 태그 칩 + 상태 점 뱃지(later=회색, reading=파랑, done=초록) + 즐겨찾기 별
5. 카드의 상태 뱃지 탭 → setStatus로 인라인 순환 변경 (later→reading→done→later), 변경 시 토스트
6. 카드 탭 → 하단 시트(bottom sheet) 상세:
   - 본문 전문, 저장일, 원본 링크 열기 버튼(새 탭) — 열기 시 status가 'later'면 setStatus(id,'reading') 자동 호출, done이면 유지
   - 상태 선택 세그먼트 (수동 변경)
   - 메모 편집 (blur 시 자동 저장)
   - 태그 편집: 기존 칩 X로 삭제, + 로 추가(자동완성), "AI 재제안" 버튼 → /api/suggest-tags 재호출
   - 즐겨찾기 토글, 삭제(확인 다이얼로그)
7. 정렬 드롭다운: 최신순 / 오래된순 / 즐겨찾기 우선

전 기능이 useLiveQuery 기반으로 즉시 반영되는지, 상태 필터 + 태그 필터가 AND로 정확히 결합되는지 확인하라.
```

---

## PHASE 5 — 다시보기 + 설정 (백업 & v1 마이그레이션)

```
SPEC.md 4.3, 4.4를 구현하라.

[다시보기 탭]
1. "읽다 만 글" 섹션 (최상단): getStaleReadingItems(7) — reading 상태로 7일 이상 방치된 항목. 카드에 "N일째 읽는 중" 표시
2. "오늘의 발견" 섹션: getRediscoveryItems(3) — 카드 탭 시 상세 시트 열림 + markViewed 호출
3. "그때 그 글" 섹션: 1/3/6/12개월 전 ±3일 범위에 저장된 항목 표시 (없는 구간은 섹션 숨김)
4. 새로고침 버튼으로 랜덤 재추첨

[설정 페이지]
1. JSON 내보내기: exportJSON() → rethread-backup-YYYYMMDD.json 다운로드 (Blob + a.download)
2. JSON 가져오기: 파일 선택 → 병합/덮어쓰기 선택 다이얼로그 → importJSON → 결과 요약 토스트 ("42개 추가, 3개 중복 건너뜀")
3. v1 마이그레이션: 가져오기에서 threads-clipper 형식의 JSON을 자동 감지해 필드 매핑
   - v1 상태값 → status 매핑: "나중에 볼 것"→later, "읽는 중"→reading, "다 봄"→done, "중요"→isFavorite=true (상태는 later로)
   - 매핑 후 결과 요약 표시. 알 수 없는 필드는 무시하되 url이 없는 항목은 건너뜀
4. 태그 관리 목록: 태그별 count 표시, 이름 변경(renameTag), 삭제(deleteTag, 확인 필요)
5. 통계: 총 항목 수, 상태별 분포(막대), 태그 수, navigator.storage.estimate()로 사용 용량
6. 백업 리마인더: 마지막 내보내기로부터 30일 경과 시 설정 아이콘에 점 배지 (마지막 내보내기 시각은 localStorage 허용)

[마무리]
- PWA manifest.json + 아이콘 (다크 배경, 앱 이름 RETHREAD)
- 모바일 390px 뷰포트 전 화면 점검
- npm run build 최종 통과
```

---

## PHASE 6 — 배포 및 검수 체크리스트

```
Vercel 배포를 준비하라.

1. README.md 작성: 프로젝트 소개, 로컬 실행법, Vercel 배포 시 ANTHROPIC_API_KEY 환경변수 설정 안내
2. 검수 체크리스트를 직접 수행하고 결과를 보고하라:
   [ ] 쓰레드 링크 붙여넣기 → 3초 내 카드 + 태그 제안 표시
   [ ] 태그 제안 수정(제거/추가) 후 보관 → 라이브러리 '나중에 볼 것'에 반영
   [ ] 상태 뱃지 탭으로 later→reading→done 순환 변경 동작
   [ ] 원본 링크 열기 시 later→reading 자동 전환, done은 유지
   [ ] 상태 필터 + 태그 필터 AND 결합 정확성
   [ ] 라이브러리에서 태그 재편집 → 즉시 반영, 태그 필터에도 반영
   [ ] 검색: 작성자/본문/메모/태그 각각 검색어로 조회됨
   [ ] 다시보기: 7일 방치 reading 항목이 "읽다 만 글"에 노출
   [ ] 오프라인(네트워크 차단)에서 URL 저장 성공
   [ ] JSON 내보내기 → 시크릿 창에서 가져오기 → 데이터 복원 확인
   [ ] threads-clipper v1 JSON 가져오기 → 상태/중요 매핑 정확성
   [ ] 새로고침·브라우저 재시작 후 데이터 유지
   [ ] API Route 코드에 사용자 데이터 저장/로깅 코드가 없음을 확인
   [ ] 클라이언트 번들에 ANTHROPIC_API_KEY 미포함 확인 (빌드 산출물 grep)
```
