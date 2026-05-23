# JLPT ALLinOne — Claude Code 설정

## 서브에이전트: Gemini CLI

Gemini CLI (v0.43.0)가 설치되어 있으며 Claude의 Bash 툴을 통해 서브에이전트로 호출 가능합니다.

### 사용법

```bash
# 기본 호출
gemini -m gemini-3.1-pro-preview -p "질문 내용"

# 파일 컨텍스트 포함
gemini -m gemini-3.1-pro-preview -p "분석해줘" < path/to/file.json
```

### 주요 모델

| 모델 | 용도 |
|------|------|
| `gemini-3.1-pro-preview` | 고난이도 추론, 대용량 문서 분석 (컨텍스트 1M tokens) |
| `gemini-3-flash-preview` | 빠른 속도가 필요한 작업 |
| `auto` | 작업에 따라 자동 선택 (기본값) |

### 활용 시나리오

- 대용량 파일 분석 (1M token 컨텍스트 활용)
- Claude 컨텍스트 부담을 줄이기 위한 전처리 위임
- 병렬 작업 시 보조 에이전트로 활용

### 구독 정보

Google AI Pro 구독 중 — 무료 대비 4배 한도, 약 5시간마다 초기화.
