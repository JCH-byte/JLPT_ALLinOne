# content/modules

콘텐츠 생성용 입력 자산. 런타임에서 fetch되지 않음 (앱은 `data/dist/`만 읽음).

## 디렉터리

- `rules/*.json` — 레벨별 문법/난이도 규칙. 후속 `/generate-module` 자동화가 LLM 프롬프트에 결합해 사용.
- `notebooklm-inputs/*.txt` — 배치별 vocab 입력 텍스트. 후속 `/generate-module` 자동화의 입력.

## 콘텐츠 작성 흐름 (현재)

1. `data/src/{level}/modules/{moduleId}.json`을 직접 편집해서 `story`/`analysis`/`quiz` 채움.
2. `node scripts/build-data.js` 실행.
3. `serve.bat`으로 로컬 미리보기 후 push.

## 콘텐츠 작성 흐름 (자동화, 향후)

`/generate-module {level} {module-no}` 슬래시 커맨드(미구현). 위 1단계를 Claude가 자동 수행:
- `notebooklm-inputs/{moduleId}-batch-XX.txt` + `rules/{level}-module-default.json` + 프롬프트 템플릿 → `data/src/{level}/modules/{moduleId}.json` 생성
- 자가수정 빌드/검증 루프
- 사용자는 GitHub Desktop으로 push만

자세한 데이터 스키마는 `data/README.md` 참조.
