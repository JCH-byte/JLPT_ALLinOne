# content/modules

모듈 단위 vocab 그룹화 + 콘텐츠 생성 규칙·입력 자산을 보관합니다.

런타임에서는 직접 fetch되지 않습니다. 앱은 `data/dist/{level}/...`만 읽습니다. 이 디렉터리의 자산은 빌드 입력 또는 콘텐츠 생성 입력으로만 쓰입니다.

## 디렉터리

- `src/*.json` — 모듈 메타데이터. `moduleId`, `vocabIds`, `ruleFile` 등. `scripts/generate-module-vocab.js`가 이 파일을 읽어 앱이 fetch하는 `data/dist/{level}/module-vocab/*.json` 캐시를 생성합니다.
- `rules/*.json` — 레벨별 문법/난이도 규칙. 콘텐츠 생성 시 LLM 프롬프트에 결합합니다.
- `notebooklm-inputs/*.txt` — 배치별 vocab 입력 텍스트. 콘텐츠 생성(현재 수동, 추후 자동화) 입력으로 사용합니다.

## 관련 스크립트

- `node scripts/generate-module-files.js` — 새 모듈 src 파일 일괄 생성(부트스트랩)
- `node scripts/generate-module-vocab.js` — src → `data/dist/{level}/module-vocab/*.json` 캐시 생성

## 비고

과거 `dist/` 디렉터리 및 `scripts/build-modules.js`, `scripts/validate-module-batches.js`는 미완성 상태로 방치되어 제거했습니다. 콘텐츠(`story`, `analysis`, `quiz`)는 `data/src/n{level}.json`에 작성하고 `node scripts/build-data.js`로 `data/dist`를 재생성합니다.
