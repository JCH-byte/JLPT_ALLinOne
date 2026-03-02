/**
 * admin-controller.js
 * 핵심 기능: 모듈 선택 / 학습자료 입력(Intake→Normalize→Validate) / Firestore 업로드
 */

const REQUIRED_FIELDS = ['title', 'story', 'analysis', 'vocab', 'quiz'];
const ITEM_REQUIRED_FIELDS = ['id', 'word', 'read', 'mean'];
const REQUIRED_QUIZ_COUNT = 10;
const ALIAS_KEY_MAP = {
    questions: 'quiz',
    sentenceAnalysis: 'analysis'
};

function stripCodeFence(text) {
    return String(text).replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

const intakeState = {
    payload: null,
    normalizedData: null,
    validated: false,
    validationMessage: 'Validate 단계를 실행하세요.'
};

function setStageStatus(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function resetPipelineState() {
    intakeState.payload = null;
    intakeState.normalizedData = null;
    intakeState.validated = false;
    intakeState.validationMessage = 'Validate 단계를 실행하세요.';
    setStageStatus('status-intake', '대기');
    setStageStatus('status-normalize', '대기');
    setStageStatus('status-validate', '대기');
    const previewEl = document.getElementById('normalized-preview');
    if (previewEl) previewEl.textContent = 'Normalize 결과가 여기에 표시됩니다.';
    const validationEl = document.getElementById('validation-result');
    if (validationEl) validationEl.textContent = intakeState.validationMessage;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

function runAiIntake() {
    try {
        const text = stripCodeFence(document.getElementById('json-input').value);
        if (!text) throw new Error('JSON 데이터를 입력하세요.');
        const payload = JSON.parse(text);
        if (typeof payload !== 'object' || Array.isArray(payload) || payload === null) {
            throw new Error('입력은 JSON 객체여야 합니다. {title, story, analysis, vocab, quiz} 형식으로 입력하세요.');
        }
        intakeState.payload = payload;
        intakeState.normalizedData = null;
        intakeState.validated = false;
        setStageStatus('status-intake', '완료');
        setStageStatus('status-normalize', '대기');
        setStageStatus('status-validate', '대기');
        alert('Intake 완료. Normalize 단계를 진행하세요.');
    } catch (e) {
        setStageStatus('status-intake', `실패: ${e.message}`);
        alert('오류: ' + e.message);
    }
}

function applyAliasMapping(payload) {
    const result = {};
    for (const [key, value] of Object.entries(payload)) {
        const mapped = ALIAS_KEY_MAP[key] || key;
        result[mapped] = value;
    }
    return result;
}

function normalizeVocabItems(vocab) {
    if (!Array.isArray(vocab)) return [];
    return vocab.map((item, index) => {
        const n = { ...(item || {}) };
        if (!n.id) n.id = `item-${Date.now()}-${index + 1}`;
        n.word = String(n.word || n.term || '').trim();
        n.read = String(n.read || n.reading || '').trim();
        n.mean = String(n.mean || n.meaning || '').trim();
        n.tags = Array.isArray(n.tags) ? n.tags : [];
        return n;
    });
}

function runNormalize() {
    try {
        if (!intakeState.payload) throw new Error('먼저 Intake를 실행하세요.');
        const normalized = applyAliasMapping(intakeState.payload);
        if (Array.isArray(normalized.vocab)) {
            normalized.vocab = normalizeVocabItems(normalized.vocab);
        }
        intakeState.normalizedData = normalized;
        intakeState.validated = false;
        document.getElementById('normalized-preview').textContent = JSON.stringify(normalized, null, 2);
        setStageStatus('status-normalize', '완료');
        setStageStatus('status-validate', '대기');
    } catch (e) {
        setStageStatus('status-normalize', `실패: ${e.message}`);
        alert('오류: ' + e.message);
    }
}

function runValidate() {
    try {
        if (!intakeState.normalizedData) throw new Error('먼저 Normalize를 실행하세요.');
        const data = intakeState.normalizedData;
        const issues = [];

        REQUIRED_FIELDS.forEach(field => {
            const value = data[field];
            if (value === undefined || value === null
                || (typeof value === 'string' && !value.trim())
                || (Array.isArray(value) && value.length === 0)) {
                issues.push(`필수 필드 누락 또는 빈 값: ${field}`);
            }
        });

        if (Array.isArray(data.vocab)) {
            data.vocab.forEach((item, idx) => {
                ITEM_REQUIRED_FIELDS.forEach(field => {
                    if (!item?.[field] || !String(item[field]).trim()) {
                        issues.push(`vocab[${idx}].${field} 누락`);
                    }
                });
            });
        }

        if (Array.isArray(data.quiz) && data.quiz.length < REQUIRED_QUIZ_COUNT) {
            issues.push(`quiz 최소 ${REQUIRED_QUIZ_COUNT}문항 필요 (현재: ${data.quiz.length})`);
        }

        if (issues.length > 0) {
            intakeState.validated = false;
            intakeState.validationMessage = `검증 실패 (${issues.length}건):\n- ${issues.join('\n- ')}`;
        } else {
            intakeState.validated = true;
            intakeState.validationMessage = `✓ 검증 통과 (vocab: ${data.vocab?.length || 0}개, quiz: ${data.quiz?.length || 0}문항)`;
        }

        document.getElementById('validation-result').textContent = intakeState.validationMessage;
        setStageStatus('status-validate', intakeState.validated ? '완료' : '실패');
    } catch (e) {
        setStageStatus('status-validate', `실패: ${e.message}`);
        alert('오류: ' + e.message);
    }
}

// ── Module List ───────────────────────────────────────────────────────────────

async function loadModuleList(level) {
    const select = document.getElementById('module-select');
    if (!select) return;
    select.innerHTML = '<option value="">로딩 중...</option>';
    try {
        const response = await fetch('data/src/module-metadata.json');
        const metadata = await response.json();
        const modules = metadata?.levels?.[level]?.modules || [];
        select.innerHTML = '';
        if (modules.length === 0) {
            select.innerHTML = '<option value="">(모듈 없음)</option>';
            return;
        }
        modules.forEach(mod => {
            const option = document.createElement('option');
            option.value = mod.moduleId;
            option.textContent = `${mod.moduleId}${mod.theme ? ` - ${mod.theme}` : ''}`;
            select.appendChild(option);
        });
    } catch (e) {
        select.innerHTML = '<option value="">(로딩 실패)</option>';
        console.error('module-metadata 로딩 실패:', e);
    }
}

// ── GitHub Upload ─────────────────────────────────────────────────────────────

function saveGitHubSettings() {
    const token = document.getElementById('github-token').value.trim();
    const repo = document.getElementById('github-repo').value.trim();
    if (token) localStorage.setItem('gh_token', token);
    if (repo) localStorage.setItem('gh_repo', repo);
    alert('저장 완료');
}

async function handleGitHubUpload() {
    const resultEl = document.getElementById('upload-result');
    try {
        if (!intakeState.normalizedData) throw new Error('Intake → Normalize 단계를 먼저 완료하세요.');
        if (!intakeState.validated) throw new Error('Validate 통과 후에만 업로드할 수 있습니다.');

        const token = document.getElementById('github-token').value.trim() || localStorage.getItem('gh_token');
        const ownerRepo = document.getElementById('github-repo').value.trim() || localStorage.getItem('gh_repo');
        if (!token) throw new Error('GitHub Token을 입력하세요.');
        if (!ownerRepo) throw new Error('Owner/Repo를 입력하세요. (예: username/repo)');

        const level = document.getElementById('level-select').value;
        const moduleId = document.getElementById('module-select').value;
        if (!moduleId) throw new Error('모듈을 선택하세요.');

        const filePath = `data/dist/${level}/module-vocab/${moduleId}.json`;
        if (resultEl) resultEl.textContent = `업로드 중... (${filePath})`;

        const apiBase = `https://api.github.com/repos/${ownerRepo}`;
        const headers = { Authorization: `token ${token}`, 'Content-Type': 'application/json' };

        let sha;
        const getRes = await fetch(`${apiBase}/contents/${filePath}?ref=main`, { headers });
        if (getRes.ok) {
            const existing = await getRes.json();
            sha = existing.sha;
        } else if (getRes.status !== 404) {
            throw new Error(`파일 조회 실패: ${getRes.status}`);
        }

        const content = btoa(unescape(encodeURIComponent(JSON.stringify(intakeState.normalizedData, null, 2) + '\n')));
        const body = { message: `content: update ${level} ${moduleId}`, content, branch: 'main', ...(sha ? { sha } : {}) };

        const putRes = await fetch(`${apiBase}/contents/${filePath}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body)
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            throw new Error(`GitHub API 오류: ${err.message}`);
        }

        if (resultEl) resultEl.textContent = `✓ 업로드 완료: ${filePath}\n커밋 시각: ${new Date().toLocaleString()}\nGitHub Pages 배포까지 약 1-2분 소요됩니다.`;
    } catch (e) {
        if (resultEl) resultEl.textContent = `업로드 실패: ${e.message}`;
        alert(`업로드 실패: ${e.message}`);
        console.error(e);
    }
}

// ── Clear ─────────────────────────────────────────────────────────────────────

function clearPreview() {
    if (confirm('입력 데이터를 초기화하시겠습니까?')) {
        document.getElementById('json-input').value = '';
        resetPipelineState();
        const uploadResultEl = document.getElementById('upload-result');
        if (uploadResultEl) uploadResultEl.textContent = '업로드 결과가 여기에 표시됩니다.';
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    const levelSelect = document.getElementById('level-select');
    levelSelect.addEventListener('change', () => loadModuleList(levelSelect.value));
    loadModuleList(levelSelect.value);
    resetPipelineState();

    const savedToken = localStorage.getItem('gh_token');
    const savedRepo = localStorage.getItem('gh_repo');
    if (savedToken) document.getElementById('github-token').value = savedToken;
    if (savedRepo) document.getElementById('github-repo').value = savedRepo;
});
