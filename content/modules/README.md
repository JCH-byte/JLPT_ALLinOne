# content/modules

신규 모듈 기반 콘텐츠 작업 영역입니다.

- 대상: N4~N3 신규 작성, 모듈 스키마 기반 데이터
- 브랜치: `authoring/n4n3-*` 중심
- 금지: 레거시 Day 구조 직접 수정 (`legacy/day/`)

## generation batch 워크플로우

- 모듈 원본은 `content/modules/src/*.json`에 저장합니다.
- 각 모듈은 반드시 `ruleFile`을 지정하고, 규칙 파일은 `content/modules/rules/*.json`에 저장합니다.
- `generationBatches`는 배치당 20~25개 단어(`vocabIds`)를 목표로 유지합니다.
- NotebookLM 입력은 `content/modules/notebooklm-inputs/*.json`으로 생성되며, **규칙 파일 + vocab batch만** 포함하고 장문 컨텍스트는 제외합니다.
- NotebookLM 산출물(`paragraphs/sentences/quizzes`)은 `notebookLMOutputs.<batchId>.reviewed=true` + 파서 위반 없음인 배치만 병합됩니다.
- 파서 위반(미사용 단어, 오용, 난이도 이탈, 길이 초과)은 `regenerationQueue`에 자동 등록됩니다.
- 빌드 결과(`content/modules/dist/*.json`)에는 `metadata.batchProvenance`, `metadata.ruleVersion`, `metadata.promptTemplateVersion`이 포함되어 생성 재현성을 보장합니다.

## 스크립트

- `node scripts/build-modules.js`: 모듈 빌드 산출물 + NotebookLM 입력 파일 생성
- `node scripts/build-modules.js --check`: 산출물 최신성 검사
- `node scripts/validate-module-batches.js`: 배치 중복/누락 + 규칙 파일/파서 리포트 구조 검증

자세한 협업 규칙은 `docs/collaboration-workflow.md`를 따릅니다.
