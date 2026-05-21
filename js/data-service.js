/**
 * data-service.js
 * 기능: 모듈 단위 데이터 lazy-load + 로컬 dev 오버라이드 병합.
 * 단일 fetch 경로: data/dist/{level}/{index.json, modules/{moduleId}.json}.
 * day 개념·이중 모델·런타임 존재 확인 로직 없음 (빌드가 일관성 보장).
 */

const LEVEL_INDEX_CACHE = new Map();
const MODULE_DATA_CACHE = new Map();

const FIELD_ALIASES = { reading: 'read', meaning: 'mean', question: 'q', options: 'opt' };

const DEV_PREFIX = 'JLPT_DEV_DATA_OVERRIDE';
const DEV_INDEX_KEY = `${DEV_PREFIX}__INDEX`;
const LEGACY_DEV_KEY = 'JLPT_DEV_DATA_OVERRIDE';

function moduleCacheKey(level, moduleId) { return `${level}:${moduleId}`; }

function safeString(value) { return typeof value === 'string' ? value : ''; }
function safeArray(value) { return Array.isArray(value) ? value : []; }

function normalizeItemKeys(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const normalized = { ...item };
    Object.entries(FIELD_ALIASES).forEach(([legacyKey, canonicalKey]) => {
        if (normalized[canonicalKey] == null && normalized[legacyKey] != null) {
            normalized[canonicalKey] = normalized[legacyKey];
        }
    });
    return normalized;
}

function normalizeVocabItem(level, moduleId, index, vocabItem) {
    const item = normalizeItemKeys(vocabItem) || {};
    const normalized = {
        id: safeString(item.id),
        word: safeString(item.word),
        read: safeString(item.read),
        mean: safeString(item.mean),
        tags: safeArray(item.tags),
        moduleId: safeString(moduleId)
    };

    const missing = [];
    if (!normalized.word) missing.push('word');
    if (!normalized.read) missing.push('read');
    if (!normalized.mean) missing.push('mean');
    if (missing.length > 0) {
        console.warn(`[data:${level}] ${moduleId} vocab[${index}] missing: ${missing.join(', ')}`);
    }
    return normalized;
}

function normalizeQuizItem(level, moduleId, index, quizItem) {
    const item = normalizeItemKeys(quizItem) || {};
    const rawOpt = item.opt;
    const normalized = {
        q: safeString(item.q),
        opt: Array.isArray(rawOpt) ? rawOpt : [],
        ans: item.ans != null ? item.ans : '',
        comment: safeString(item.comment)
    };
    const missing = [];
    if (!normalized.q) missing.push('q');
    if (!Array.isArray(rawOpt)) missing.push('opt');
    if (item.ans == null || item.ans === '') missing.push('ans');
    if (missing.length > 0) {
        console.warn(`[data:${level}] ${moduleId} quiz[${index}] missing: ${missing.join(', ')}`);
    }
    return normalized;
}

function normalizeModuleData(level, moduleId, fileData) {
    const data = fileData || {};
    return {
        moduleId: safeString(data.moduleId) || moduleId,
        title: safeString(data.title) || moduleId,
        ordinal: data.ordinal,
        story: safeString(data.story),
        analysis: safeArray(data.analysis),
        vocab: safeArray(data.vocab).map((v, i) => normalizeVocabItem(level, moduleId, i, v)),
        quiz: safeArray(data.quiz).map((q, i) => normalizeQuizItem(level, moduleId, i, q))
    };
}

function fetchJson(url, callback) {
    fetch(url, { cache: 'no-cache' })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((json) => callback(json))
        .catch((err) => {
            console.error(`[data] Failed to fetch ${url}:`, err.message);
            callback(null);
        });
}

function makeVersionKey(level, moduleId, version) {
    return `${DEV_PREFIX}/${level}/${moduleId}/${version}`;
}

function readOverrideIndex() {
    if (typeof parseJsonSafe !== 'function') return {};
    const index = parseJsonSafe(localStorage.getItem(DEV_INDEX_KEY) || '{}', {});
    return (index && typeof index === 'object' && !Array.isArray(index)) ? index : {};
}

function getOverrideData(level, moduleId) {
    if (typeof parseJsonSafe !== 'function') return undefined;
    try {
        const index = readOverrideIndex();
        const node = index?.[level]?.[moduleId];
        const versions = Array.isArray(node?.versions) ? node.versions : [];
        if (versions.length > 0) {
            const sorted = [...versions].sort((a, b) => Number(b.version) - Number(a.version));
            const approved = sorted.find((v) => v.status === 'approved');
            const target = approved || sorted[0];
            const record = parseJsonSafe(localStorage.getItem(makeVersionKey(level, moduleId, target.version)) || 'null', null);
            return record?.data;
        }
        const legacy = parseJsonSafe(localStorage.getItem(LEGACY_DEV_KEY) || '{}', {});
        return legacy[moduleCacheKey(level, moduleId)];
    } catch (e) {
        console.error('Error reading dev overrides:', e);
        return undefined;
    }
}

function loadLevelIndex(level, callback) {
    if (LEVEL_INDEX_CACHE.has(level)) {
        callback(LEVEL_INDEX_CACHE.get(level));
        return;
    }
    fetchJson(`data/dist/${level}/index.json`, (indexData) => {
        const safe = (indexData && typeof indexData === 'object' && !Array.isArray(indexData)) ? indexData : {};
        const normalized = {
            level: safeString(safe.level) || level,
            manifest: safe.manifest || {},
            moduleOrder: safeArray(safe.moduleOrder),
            modules: (safe.modules && typeof safe.modules === 'object' && !Array.isArray(safe.modules)) ? safe.modules : {}
        };
        LEVEL_INDEX_CACHE.set(level, normalized);
        callback(normalized);
    });
}

function loadModuleData(level, moduleId, callback) {
    const key = moduleCacheKey(level, moduleId);
    if (MODULE_DATA_CACHE.has(key)) {
        callback(MODULE_DATA_CACHE.get(key));
        return;
    }
    fetchJson(`data/dist/${level}/modules/${moduleId}.json`, (fileData) => {
        const override = getOverrideData(level, moduleId);
        const merged = normalizeModuleData(level, moduleId, override || fileData || {});
        MODULE_DATA_CACHE.set(key, merged);
        callback(merged);
    });
}

function loadViewerData(level, params, callback) {
    const moduleId = params?.module ? String(params.module) : '';
    if (!moduleId) {
        callback({ data: null, day: null, moduleId: '', moduleMeta: null, indexData: null });
        return;
    }
    loadLevelIndex(level, (indexData) => {
        loadModuleData(level, moduleId, (data) => {
            callback({
                data,
                day: null, // 호환성을 위한 잔존 필드. day 개념 폐지됨.
                moduleId,
                moduleMeta: indexData?.modules?.[moduleId] || null,
                indexData
            });
        });
    });
}

// 레거시 호환: 일부 호출자가 day 기반 API를 쓸 수 있음. 새 구조에서는 day → moduleId 대체.
function getMergedModuleData(level, moduleId, fileData) {
    return normalizeModuleData(level, moduleId, getOverrideData(level, moduleId) || fileData || {});
}
