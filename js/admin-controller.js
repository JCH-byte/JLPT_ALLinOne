/**
 * admin-controller.js
 * 기능: 데이터 입력, 버전 히스토리 관리, JSON/레거시 JS 다운로드
 */

const DEV_PREFIX = 'JLPT_DEV_DATA_OVERRIDE';
const DEV_INDEX_KEY = `${DEV_PREFIX}__INDEX`;
const LEGACY_DEV_KEY = 'JLPT_DEV_DATA_OVERRIDE';
const REQUIRED_FIELDS = ['title', 'story', 'analysis', 'vocab', 'quiz'];
const ARRAY_POLICY_FIELDS = ['analysis', 'vocab', 'quiz'];
const ALIAS_KEY_MAP = {
    questions: 'quiz',
    sentenceAnalysis: 'analysis'
};

const intakeState = {
    payload: null,
    normalizedData: null,
    normalizedPreviewText: '',
    validated: false,
    validationMessage: 'Validate 단계를 실행하세요.',
    day: null
};

function makeVersionKey(level, day, version) {
    return `${DEV_PREFIX}/${level}/${day}/${version}`;
}

function parseJsonOrDefault(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function readIndex() {
    const index = parseJsonOrDefault(localStorage.getItem(DEV_INDEX_KEY) || '{}', {});
    return (index && typeof index === 'object' && !Array.isArray(index)) ? index : {};
}

function writeIndex(index) {
    localStorage.setItem(DEV_INDEX_KEY, JSON.stringify(index));
}

function ensureIndexNode(index, level, day) {
    if (!index[level]) index[level] = {};
    if (!index[level][day]) index[level][day] = { versions: [] };
    if (!Array.isArray(index[level][day].versions)) index[level][day].versions = [];
    return index[level][day];
}

function readVersionRecord(level, day, version) {
    return parseJsonOrDefault(localStorage.getItem(makeVersionKey(level, day, version)) || 'null', null);
}

function getDayVersions(level, day) {
    const index = readIndex();
    const dayNode = index?.[level]?.[String(day)];
    const versionsMeta = Array.isArray(dayNode?.versions) ? dayNode.versions : [];

    return versionsMeta
        .map(meta => readVersionRecord(level, String(day), Number(meta.version)))
        .filter(Boolean)
        .sort((a, b) => a.version - b.version);
}

function getLatestRecord(level, day) {
    const versions = getDayVersions(level, day);
    if (versions.length === 0) return null;
    return versions[versions.length - 1];
}

function migrateLegacyIfNeeded() {
    const index = readIndex();
    if (Object.keys(index).length > 0) return;

    const legacyRaw = localStorage.getItem(LEGACY_DEV_KEY);
    if (!legacyRaw) return;

    const legacy = parseJsonOrDefault(legacyRaw, {});
    const nextIndex = {};
    const now = new Date().toISOString();

    Object.keys(legacy).forEach(compositeKey => {
        const [level, day] = compositeKey.split('-');
        if (!level || !day) return;

        const version = 1;
        const record = {
            level,
            day: Number(day),
            version,
            status: 'approved',
            timestamp: now,
            author: 'legacy-migration',
            changeSummary: 'Migrated from legacy single localStorage blob.',
            data: legacy[compositeKey]
        };

        localStorage.setItem(makeVersionKey(level, day, version), JSON.stringify(record));
        const dayNode = ensureIndexNode(nextIndex, level, day);
        dayNode.versions.push({
            version,
            status: record.status,
            timestamp: record.timestamp,
            author: record.author,
            changeSummary: record.changeSummary
        });
    });

    writeIndex(nextIndex);
    localStorage.removeItem(LEGACY_DEV_KEY);
}

function getInputDay() {
    const dayInput = document.getElementById('day-input');
    const day = Number(dayInput.value);
    if (!Number.isInteger(day) || day <= 0) {
        throw new Error('Day는 1 이상의 정수여야 합니다.');
    }
    return day;
}

function upsertMeta(index, level, day, record) {
    const dayNode = ensureIndexNode(index, level, String(day));
    const existingIdx = dayNode.versions.findIndex(v => Number(v.version) === Number(record.version));
    const meta = {
        version: record.version,
        status: record.status,
        timestamp: record.timestamp,
        author: record.author,
        changeSummary: record.changeSummary
    };
    if (existingIdx >= 0) {
        dayNode.versions[existingIdx] = meta;
    } else {
        dayNode.versions.push(meta);
    }
    dayNode.versions.sort((a, b) => a.version - b.version);
}

function getRequiredFieldMode() {
    return document.getElementById('required-field-mode').value;
}

function getArrayPolicies() {
    return {
        analysis: document.getElementById('policy-analysis').value,
        vocab: document.getElementById('policy-vocab').value,
        quiz: document.getElementById('policy-quiz').value
    };
}

function validateRequiredFields(data) {
    const missing = REQUIRED_FIELDS.filter(field => {
        const value = data?.[field];
        return value === undefined || value === null;
    });

    if (missing.length === 0) return true;

    const mode = getRequiredFieldMode();
    const message = `필수 필드 누락: ${missing.join(', ')}`;
    if (mode === 'strict') {
        alert(`${message}\n저장을 차단합니다.`);
        return false;
    }

    return confirm(`⚠️ ${message}\n강한 경고: 누락된 상태로 저장을 진행하시겠습니까?`);
}

function normalizeStory(story, storyScenes) {
    if (typeof story === 'string' && story.trim()) return story;
    if (!Array.isArray(storyScenes)) return story ?? null;
    const lines = storyScenes
        .map(scene => {
            if (typeof scene === 'string') return scene.trim();
            if (scene && typeof scene === 'object') {
                return String(scene.text ?? scene.scene ?? scene.content ?? '').trim();
            }
            return '';
        })
        .filter(Boolean);
    return lines.join('\n\n') || null;
}

function normalizeIncomingData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('data는 object여야 합니다.');
    }

    const normalized = { ...data };

    Object.entries(ALIAS_KEY_MAP).forEach(([alias, standard]) => {
        if (!Object.prototype.hasOwnProperty.call(normalized, alias)) return;
        if (!Object.prototype.hasOwnProperty.call(normalized, standard)) {
            normalized[standard] = normalized[alias];
        }
        delete normalized[alias];
    });

    normalized.story = normalizeStory(normalized.story, normalized.storyScenes);
    delete normalized.storyScenes;

    return normalized;
}

function setStageStatus(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function resetPipelineState() {
    intakeState.payload = null;
    intakeState.normalizedData = null;
    intakeState.normalizedPreviewText = '';
    intakeState.validated = false;
    intakeState.validationMessage = 'Validate 단계를 실행하세요.';
    intakeState.day = null;
    setStageStatus('status-intake', '대기');
    setStageStatus('status-normalize', '대기');
    setStageStatus('status-validate', '대기');
    setStageStatus('status-save', '대기');
    const previewEl = document.getElementById('normalized-preview');
    if (previewEl) previewEl.textContent = 'Normalize 결과가 여기에 표시됩니다.';
    const validationEl = document.getElementById('validation-result');
    if (validationEl) validationEl.textContent = intakeState.validationMessage;
}

function runAiIntake() {
    try {
        const text = document.getElementById('json-input').value;
        if (!text.trim()) {
            throw new Error('JSON 데이터를 입력하세요.');
        }
        const payload = JSON.parse(text);
        if (!payload.day || !payload.data) {
            throw new Error('JSON에 "day"와 "data" 필드가 포함되어야 합니다.');
        }

        intakeState.payload = payload;
        intakeState.day = Number(payload.day);
        intakeState.validated = false;
        document.getElementById('day-input').value = String(intakeState.day);
        setStageStatus('status-intake', '완료');
        setStageStatus('status-normalize', '대기');
        setStageStatus('status-validate', '대기');
        setStageStatus('status-save', '대기');
        alert('AI Intake 완료. Normalize 단계를 진행하세요.');
    } catch (e) {
        setStageStatus('status-intake', `실패: ${e.message}`);
        alert('오류 발생: ' + e.message);
    }
}

function runNormalize() {
    try {
        if (!intakeState.payload) {
            throw new Error('먼저 AI Intake를 실행하세요.');
        }
        const normalizedData = normalizeIncomingData(intakeState.payload.data);
        intakeState.normalizedData = normalizedData;
        intakeState.normalizedPreviewText = JSON.stringify({ day: intakeState.day, data: normalizedData }, null, 2);
        intakeState.validated = false;

        document.getElementById('normalized-preview').textContent = intakeState.normalizedPreviewText;
        setStageStatus('status-normalize', '완료');
        setStageStatus('status-validate', '대기');
        setStageStatus('status-save', '대기');
    } catch (e) {
        setStageStatus('status-normalize', `실패: ${e.message}`);
        alert('오류 발생: ' + e.message);
    }
}

function runValidate() {
    try {
        if (!intakeState.normalizedData) {
            throw new Error('먼저 Normalize 단계를 실행하세요.');
        }
        const ok = validateRequiredFields(intakeState.normalizedData);
        intakeState.validated = ok;
        intakeState.validationMessage = ok
            ? '정규화/필수 필드 검증 통과'
            : '필수 필드 검증 실패';
        document.getElementById('validation-result').textContent = intakeState.validationMessage;
        setStageStatus('status-validate', ok ? '완료' : '실패');
        setStageStatus('status-save', '대기');
    } catch (e) {
        setStageStatus('status-validate', `실패: ${e.message}`);
        alert('오류 발생: ' + e.message);
    }
}

function getIdentityKey(item) {
    if (!item || typeof item !== 'object') return null;
    return item.id ?? item.word ?? item.term ?? item.question ?? item.text ?? null;
}

function mergeArraysWithPolicy(previousArray, incomingArray, policy) {
    if (policy === 'replace') {
        return [...incomingArray];
    }

    const merged = [...previousArray];
    incomingArray.forEach(entry => {
        const key = getIdentityKey(entry);
        if (key === null) {
            merged.push(entry);
            return;
        }

        const existingIdx = merged.findIndex(existing => getIdentityKey(existing) === key);
        if (existingIdx >= 0) {
            merged[existingIdx] = entry;
        } else {
            merged.push(entry);
        }
    });

    return merged;
}

function mergeDayData(previousData, incomingData, arrayPolicies) {
    const merged = { ...previousData, ...incomingData };

    ARRAY_POLICY_FIELDS.forEach(field => {
        if (!Object.prototype.hasOwnProperty.call(incomingData, field)) return;
        if (!Array.isArray(incomingData[field])) {
            throw new Error(`${field} 필드는 배열이어야 합니다.`);
        }
        const previousArray = Array.isArray(previousData?.[field]) ? previousData[field] : [];
        merged[field] = mergeArraysWithPolicy(previousArray, incomingData[field], arrayPolicies[field]);
    });

    return merged;
}

function summarizeDiff(before, after) {
    const beforeKeys = Object.keys(before || {});
    const afterKeys = Object.keys(after || {});

    const added = afterKeys.filter(key => !beforeKeys.includes(key));
    const removed = beforeKeys.filter(key => !afterKeys.includes(key));
    const changed = afterKeys.filter(key => beforeKeys.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));

    return { added, removed, changed };
}

function renderSaveDiff(before, after) {
    const el = document.getElementById('save-diff-result');
    const summary = summarizeDiff(before, after);
    const changedPaths = collectChangedPaths(before || {}, after || {});

    el.textContent = [
        `Added (${summary.added.length}): ${summary.added.join(', ') || '(none)'}`,
        `Removed (${summary.removed.length}): ${summary.removed.join(', ') || '(none)'}`,
        `Changed (${summary.changed.length}): ${summary.changed.join(', ') || '(none)'}`,
        `Changed Paths (${changedPaths.length}): ${changedPaths.join(', ') || '(none)'}`,
        '',
        '[Before]',
        JSON.stringify(before || {}, null, 2),
        '',
        '[After]',
        JSON.stringify(after || {}, null, 2)
    ].join('\n');
}

function runPreflightValidation(previousData, nextData, isMerge) {
    if (!previousData) return true;

    const changedPaths = collectChangedPaths(previousData, nextData);
    if (changedPaths.length === 0) {
        return confirm('변경 사항이 없습니다. 그래도 신규 버전으로 저장하시겠습니까?');
    }

    if (!isMerge) return true;

    const removedRequired = REQUIRED_FIELDS.filter(field => (field in previousData) && !(field in nextData));
    if (removedRequired.length > 0) {
        return confirm(`⚠️ Preflight 경고: 기존 day의 필수 필드가 제거됩니다 (${removedRequired.join(', ')}). 계속하시겠습니까?`);
    }

    return true;
}

// 미리보기 저장 (덮어쓰기 또는 병합)
function savePreview(isMerge) {
    try {
        if (!intakeState.payload || !intakeState.normalizedData) {
            throw new Error('AI Intake → Normalize 단계를 먼저 완료하세요.');
        }
        if (!intakeState.validated) {
            throw new Error('Validate 통과 후에만 저장할 수 있습니다.');
        }

        const level = document.getElementById('level-select').value;
        const author = (document.getElementById('author-input').value || 'anonymous').trim();
        const changeSummary = (document.getElementById('summary-input').value || 'No summary').trim();
        const arrayPolicies = getArrayPolicies();

        const day = Number(intakeState.day);
        document.getElementById('day-input').value = String(day);

        const previous = getLatestRecord(level, day);
        const previousData = previous?.data || {};
        const nextVersion = previous ? previous.version + 1 : 1;
        const nextData = (isMerge && previous)
            ? mergeDayData(previousData, intakeState.normalizedData, arrayPolicies)
            : intakeState.normalizedData;

        if (!runPreflightValidation(previousData, nextData, isMerge)) return;

        const record = {
            level,
            day,
            version: nextVersion,
            status: 'draft',
            timestamp: new Date().toISOString(),
            author,
            changeSummary,
            data: nextData,
            qa: {
                normalized: true,
                validated: true
            }
        };

        localStorage.setItem(makeVersionKey(level, day, nextVersion), JSON.stringify(record));

        const index = readIndex();
        upsertMeta(index, level, day, record);
        writeIndex(index);

        renderHistory();
        renderSaveDiff(previousData, nextData);
        setStageStatus('status-save', '완료');

        if (isMerge && previous) {
            alert(`[${level.toUpperCase()}] Day ${day} v${nextVersion} draft로 병합 저장되었습니다.`);
        } else {
            alert(`[${level.toUpperCase()}] Day ${day} v${nextVersion} draft가 저장되었습니다.`);
        }
    } catch (e) {
        alert('오류 발생: ' + e.message);
        console.error(e);
    }
}

function buildLevelData(level) {
    const index = readIndex();
    const levelNode = index[level] || {};
    const levelData = {};

    Object.keys(levelNode).forEach(day => {
        const versions = getDayVersions(level, day);
        if (versions.length === 0) return;

        const approved = [...versions].reverse().find(v => v.status === 'approved');
        const latest = versions[versions.length - 1];
        const selected = approved || latest;
        if (!selected?.qa?.normalized || !selected?.qa?.validated) return;
        levelData[String(day)] = selected.data;
    });

    return levelData;
}

function triggerDownload(content, fileName, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 표준 JSON 파일 다운로드 생성 (n4/day-03.json 규칙)
function downloadFile() {
    const level = document.getElementById('level-select').value;
    const levelData = buildLevelData(level);

    if (Object.keys(levelData).length === 0) {
        if (!confirm('저장된 프리뷰 데이터가 없습니다. 빈 파일을 생성하시겠습니까?')) return;
        triggerDownload('{}\n', `${level}.json`, 'application/json');
        return;
    }

    const days = Object.keys(levelData)
        .map(day => Number(day))
        .filter(day => !Number.isNaN(day))
        .sort((a, b) => a - b);

    days.forEach(day => {
        const dayData = {
            day,
            data: levelData[String(day)]
        };
        const dayLabel = String(day).padStart(2, '0');
        const fileName = `${level}-day-${dayLabel}.json`;
        triggerDownload(`${JSON.stringify(dayData, null, 2)}\n`, fileName, 'application/json');
    });
}

// 호환 옵션: 레거시 JS 파일 다운로드
function downloadLegacyJsFile() {
    const level = document.getElementById('level-select').value;
    const varName = `${level.toUpperCase()}_DATA`;
    const levelData = buildLevelData(level);

    if (Object.keys(levelData).length === 0) {
        if (!confirm('저장된 프리뷰 데이터가 없습니다. 빈 파일을 생성하시겠습니까?')) return;
    }

    const fileContent = `/**\n * JLPT ${level.toUpperCase()} Data\n * Generated by Admin Tool (Legacy JS Compatibility)\n * Updated: ${new Date().toLocaleString()}\n */\nvar ${varName} = ${JSON.stringify(levelData, null, 4)};\n`;

    triggerDownload(fileContent, `${level}_data.js`, 'text/javascript');
}

function getSelectedDay() {
    return String(getInputDay());
}

function compareVersions() {
    const leftValue = document.getElementById('compare-left').value;
    const rightValue = document.getElementById('compare-right').value;

    if (!leftValue || !rightValue) {
        alert('비교할 버전 2개를 선택하세요.');
        return;
    }

    const [levelL, dayL, versionL] = leftValue.split(':');
    const [levelR, dayR, versionR] = rightValue.split(':');
    if (levelL !== levelR || dayL !== dayR) {
        alert('동일한 level/day 내 버전만 비교할 수 있습니다.');
        return;
    }

    const left = readVersionRecord(levelL, dayL, Number(versionL));
    const right = readVersionRecord(levelR, dayR, Number(versionR));

    const diffEl = document.getElementById('compare-result');
    if (!left || !right) {
        diffEl.textContent = '선택한 버전을 읽을 수 없습니다.';
        return;
    }

    const changedKeys = collectChangedPaths(left.data, right.data);
    diffEl.textContent = [
        `Left: v${left.version} (${left.status}) / ${left.timestamp}`,
        `Right: v${right.version} (${right.status}) / ${right.timestamp}`,
        `Changed Paths (${changedKeys.length}): ${changedKeys.join(', ') || '(none)'}`,
        '',
        '[Left JSON]',
        JSON.stringify(left.data, null, 2),
        '',
        '[Right JSON]',
        JSON.stringify(right.data, null, 2)
    ].join('\n');
}

function collectChangedPaths(a, b, base = '') {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
        return [base || '$'];
    }

    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const paths = [];

    keys.forEach(key => {
        const nextBase = base ? `${base}.${key}` : key;
        if (!(key in a) || !(key in b)) {
            paths.push(nextBase);
            return;
        }
        paths.push(...collectChangedPaths(a[key], b[key], nextBase));
    });

    return paths;
}

function restoreSelectedVersion() {
    const selected = document.getElementById('history-select').value;
    if (!selected) {
        alert('복원할 버전을 선택하세요.');
        return;
    }

    const [level, day, version] = selected.split(':');
    const source = readVersionRecord(level, day, Number(version));
    if (!source) {
        alert('선택 버전을 읽지 못했습니다.');
        return;
    }

    const latest = getLatestRecord(level, Number(day));
    const nextVersion = latest ? latest.version + 1 : Number(version) + 1;

    const record = {
        ...source,
        version: nextVersion,
        status: 'draft',
        timestamp: new Date().toISOString(),
        author: (document.getElementById('author-input').value || 'anonymous').trim(),
        changeSummary: `Restore from v${source.version}: ${(document.getElementById('summary-input').value || 'restore').trim()}`
    };

    localStorage.setItem(makeVersionKey(level, day, nextVersion), JSON.stringify(record));

    const index = readIndex();
    upsertMeta(index, level, day, record);
    writeIndex(index);

    renderHistory();
    alert(`v${source.version}을(를) 기반으로 v${nextVersion} draft를 생성했습니다.`);
}

function approveSelectedVersion() {
    const selected = document.getElementById('history-select').value;
    if (!selected) {
        alert('확정(approved) 처리할 버전을 선택하세요.');
        return;
    }

    const [level, day, version] = selected.split(':');
    const record = readVersionRecord(level, day, Number(version));
    if (!record) {
        alert('선택 버전을 읽지 못했습니다.');
        return;
    }

    record.status = 'approved';
    record.timestamp = new Date().toISOString();
    record.author = (document.getElementById('author-input').value || record.author || 'anonymous').trim();
    const summaryInput = (document.getElementById('summary-input').value || '').trim();
    if (summaryInput) record.changeSummary = summaryInput;

    localStorage.setItem(makeVersionKey(level, day, Number(version)), JSON.stringify(record));

    const index = readIndex();
    upsertMeta(index, level, day, record);
    writeIndex(index);

    renderHistory();
    alert(`v${version}이(가) approved로 확정되었습니다.`);
}

function renderHistory() {
    const level = document.getElementById('level-select').value;
    let day;
    try {
        day = getSelectedDay();
    } catch (e) {
        day = '';
    }

    const historySelect = document.getElementById('history-select');
    const leftSelect = document.getElementById('compare-left');
    const rightSelect = document.getElementById('compare-right');
    const historyList = document.getElementById('history-list');

    [historySelect, leftSelect, rightSelect].forEach(el => {
        el.innerHTML = '';
    });

    if (!day) {
        historyList.innerHTML = '<li>Day를 입력하면 히스토리를 확인할 수 있습니다.</li>';
        return;
    }

    const versions = getDayVersions(level, day);
    if (versions.length === 0) {
        historyList.innerHTML = '<li>저장된 버전이 없습니다.</li>';
        return;
    }

    historyList.innerHTML = versions
        .map(v => `<li><strong>v${v.version}</strong> [${v.status}] ${v.timestamp} - ${v.author} :: ${v.changeSummary}</li>`)
        .join('');

    versions.forEach(v => {
        const value = `${level}:${day}:${v.version}`;
        const label = `v${v.version} [${v.status}] ${v.author}`;
        [historySelect, leftSelect, rightSelect].forEach(el => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            el.appendChild(option);
        });
    });

    if (leftSelect.options.length > 0) leftSelect.selectedIndex = 0;
    if (rightSelect.options.length > 1) rightSelect.selectedIndex = rightSelect.options.length - 1;
}

// 임시 데이터 초기화
function clearPreview() {
    if (confirm('모든 임시 데이터를 정말 삭제하시겠습니까?\n(복구할 수 없습니다)')) {
        const removableKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`${DEV_PREFIX}/`)) removableKeys.push(key);
        }
        removableKeys.forEach(key => localStorage.removeItem(key));
        localStorage.removeItem(DEV_INDEX_KEY);
        localStorage.removeItem(LEGACY_DEV_KEY);
        renderHistory();
        resetPipelineState();
        document.getElementById('save-diff-result').textContent = '저장 후 추가/삭제/변경 요약이 표시됩니다.';
        alert('초기화 완료');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    migrateLegacyIfNeeded();

    const levelSelect = document.getElementById('level-select');
    const dayInput = document.getElementById('day-input');

    levelSelect.addEventListener('change', renderHistory);
    dayInput.addEventListener('input', renderHistory);

    resetPipelineState();

    renderHistory();
});
