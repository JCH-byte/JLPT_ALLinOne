# 작업 워크플로우

현재는 1인 로컬 작업 → `main`에 직접 푸시. 커밋·머지는 GitHub Desktop으로 사용자가 수동 진행.

## 데이터 변경 규칙 (강제)

- `data/dist/**`는 **항상 생성물**이며 수동 편집 금지.
- 콘텐츠 변경은 `data/src/{level}/modules/{moduleId}.json` (모듈 self-contained, vocabIds + story/analysis/quiz)에서 수행.
- 새 vocab은 `data/src/{level}/vocab.json`에 추가 후 모듈의 `vocabIds`에서 참조.
- 변경 후 `node scripts/build-data.js`로 `data/dist`를 재생성하고 `node scripts/build-data.js --check`로 동기화 확인 후 푸시.
- 자세한 스키마 및 디렉터리 구조는 `data/README.md` 참조.

## 로컬 실행

`file://` 직접 열기는 fetch 차단됨. `node scripts/serve.js` (또는 `serve.bat`)로 `http://localhost:8000` 띄울 것.

## CI

`.github/workflows/verify-data-sync.yml`이 `node scripts/build-data.js --check`로 src↔dist 동기화만 강제합니다.

## 과거 규칙 (폐기)

이전 다인 협업 시 사용하던 브랜치 prefix(`migration/n5-*`, `authoring/n4n3-*`, `infra/*`, `schema/*`), touch scope/merge order, 경로 분리 규칙은 더 이상 적용하지 않습니다.
