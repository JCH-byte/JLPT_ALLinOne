# JLPT 데이터 관리

## 디렉터리 구조

```
data/src/{level}/
  vocab.json                          # 레벨 vocab 풀 (id, word, read, mean, tags)
  modules/{moduleId}.json             # 모듈 1개의 모든 것 (vocabIds 참조 + story/analysis/quiz)
data/dist/{level}/
  index.json                          # 모듈 목록 + 메타 (moduleOrder, modules)
  modules/{moduleId}.json             # 빌드 결과 (vocab inline 포함)
```

런타임에서는 `data/dist/{level}/index.json`과 `data/dist/{level}/modules/{moduleId}.json`만 fetch.

## 빌드

```bash
node scripts/build-data.js          # src → dist 생성
node scripts/build-data.js --check  # 동기화 검증 (CI 동일)
```

## 규칙

- **src만 수정.** `data/dist/**`는 100% 생성물. 수동 편집 금지.
- 모듈 수정: `data/src/{level}/modules/{moduleId}.json` 직접 편집 → `build-data.js` 재실행.
- 새 vocab 추가: `data/src/{level}/vocab.json`에 추가 후 모듈의 `vocabIds`에 id 등록.

## 로컬 실행

브라우저 직접 열기(`file://`)는 fetch 차단으로 실패. 정적 서버로 띄울 것:

```bash
node scripts/serve.js          # 기본 포트 8000
# 또는 Windows에서
serve.bat
```
`http://localhost:8000` 접속.

## 모듈 schema

src 모듈 파일 (`data/src/{level}/modules/{moduleId}.json`):
```json
{
  "moduleId": "n3-module-001",
  "level": "n3",
  "ordinal": 1,
  "title": "...",
  "ruleVersion": "n3-rule-v1",
  "vocabIds": ["v-...", ...],
  "story": "<h3>...</h3><p>...</p>",
  "analysis": [{ "sent": "...", "trans": "...", "grammar": "...", "tags": [...] }],
  "quiz": [{ "q": "...", "opt": [...], "ans": 0, "comment": "..." }]
}
```

dist 모듈 파일은 같은 모양에서 `vocabIds` 대신 `vocab` 배열이 인라인됨.

## 보존 자산

- `content/modules/{rules,notebooklm-inputs}/` — 후속 `/generate-module` 자동화 입력.
- `archive/n4-invalid/` — 과거 무효 데이터 보관(현 빌드 무관).
