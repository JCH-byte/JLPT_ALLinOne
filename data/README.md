# JLPT 데이터 관리 규칙

## 단일 원천 포맷
- 원천 데이터는 `data/src/n{1..5}.json`만 수정합니다.
- `data/dist/{level}/index.json`, `data/dist/{level}/day-{n}.json`은 배포/런타임용 **생성물**입니다.

## 빌드
```bash
node scripts/build-data.js
```

## 검증(동기화 확인)
```bash
node scripts/build-data.js --check
```

> 규칙: **수정은 src(item)만, dist는 생성물**
>
> 🚫 **금지:** `data/dist/{level}/day-{n}.json`, `index.json`을 직접 수정하지 않습니다.
> 변경이 필요하면 `data/src/{level}.items.json`(원천 item)을 수정한 뒤 `node scripts/build-data.js`로 재생성합니다.


## 표준 수정 플로우 (patch 기반)
1. admin에서 `src patch` 포맷(`{ level, day, data }`)으로 patch 파일을 다운로드합니다.
2. patch를 `node scripts/apply-day-patch.js <patch.json>`로 `data/src/nX.json`에 안전 병합합니다.
3. 스크립트가 병합 직후 `node scripts/build-data.js --check`를 자동 실행해 `dist` 동기화를 강제합니다.
4. 동기화 검증을 통과한 상태로 PR을 생성합니다.

## pre-commit 훅(선택)
리포지토리 훅 경로를 설정하면 커밋 전에 자동으로 dist를 재생성/검증합니다.

```bash
git config core.hooksPath .githooks
```

## N4 공개 범위 정책(환경별)
- `n4` 레벨 공개 범위는 `N4_MAX_DAY` 환경변수로 제어합니다.
- 기본값은 `28`이며, 설정하지 않으면 Day 28까지 생성됩니다.
- `N4_MAX_DAY`는 `1`~`28` 정수만 허용됩니다.

## 배포 체크리스트
- 배포 환경의 `N4_MAX_DAY` 값 확인(기본: `28`, 필요 시 축소).
- `node scripts/build-data.js --check` 실행으로 `data/src`와 `data/dist` 동기화 확인.


## 협업 경로 분리(전환기)
- 신규 모듈 기반 작업 경로: `content/modules/`
- 레거시 Day 기반 작업 경로: `legacy/day/`
- 브랜치/병합/PR touch scope 규칙: `docs/collaboration-workflow.md`
