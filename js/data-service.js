/**
 * data-service.js
 * 기능: Day 단위 데이터 lazy-load, 로컬 데이터 오버라이드 병합
 */

const DAY_DATA_CACHE = new Map();
const LEVEL_INDEX_CACHE = new Map();

const FIELD_ALIASES = {
    reading: 'read',
    meaning: 'mean',
    question: 'q',
    options: 'opt'
};

const DEV_PREFIX = 'JLPT_DEV_DATA_OVERRIDE';
const DEV_INDEX_KEY = `${DEV_PREFIX}__INDEX`;
const LEGACY_DEV_KEY = 'JLPT_DEV_DATA_OVERRIDE';

function getDayCacheKey(level, day) {
    return `${level}-${day}`;
}

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

function safeString(value) {
    return typeof value === 'string' ? value : '';
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeVocabItem(levelName, day, index, vocabItem) {
    const item = normalizeItemKeys(vocabItem) || {};
    const normalized = {
        word: safeString(item.word),
        read: safeString(item.read),
        mean: safeString(item.mean),
        tags: safeArray(item.tags)
    };

    const missing = [];
    if (!normalized.word) missing.push('word');
    if (!normalized.read) missing.push('read');
    if (!normalized.mean) missing.push('mean');

    if (missing.length > 0) {
        console.warn(`[data:${levelName}] Day ${day} vocab[${index}] missing required fields: ${missing.join(', ')}`);
    }

    return normalized;
}

function normalizeQuizItem(levelName, day, index, quizItem) {
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
        console.warn(`[data:${levelName}] Day ${day} quiz[${index}] missing required fields: ${missing.join(', ')}`);
    }

    return normalized;
}

function normalizeDayData(level, day, dayData) {
    let normalizedDayData = dayData;
    if (Array.isArray(normalizedDayData)) normalizedDayData = { vocab: normalizedDayData };

    const vocab = safeArray(normalizedDayData?.vocab).map((item, idx) => normalizeVocabItem(level, day, idx, item));
    const quiz = safeArray(normalizedDayData?.quiz).map((item, idx) => normalizeQuizItem(level, day, idx, item));

    return {
        title: safeString(normalizedDayData?.title) || `Day ${day} 단어장`,
        story: normalizedDayData?.story == null ? null : safeString(normalizedDayData.story),
        analysis: safeArray(normalizedDayData?.analysis),
        vocab,
        quiz
    };
}

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

function readOverrideIndex() {
    const index = parseJsonOrDefault(localStorage.getItem(DEV_INDEX_KEY) || '{}', {});
    return (index && typeof index === 'object' && !Array.isArray(index)) ? index : {};
}

function getOverrideData(level, day) {
    try {
        const index = readOverrideIndex();
        const dayNode = index?.[level]?.[String(day)];
        const versions = Array.isArray(dayNode?.versions) ? dayNode.versions : [];

        if (versions.length > 0) {
            const sorted = [...versions].sort((a, b) => Number(b.version) - Number(a.version));
            const approved = sorted.find(v => v.status === 'approved');
            const target = approved || sorted[0];
            const record = parseJsonOrDefault(localStorage.getItem(makeVersionKey(level, day, target.version)) || 'null', null);
            return record?.data;
        }

        // Legacy fallback: single blob key
        const legacy = parseJsonOrDefault(localStorage.getItem(LEGACY_DEV_KEY) || '{}', {});
        return legacy[getDayCacheKey(level, day)];
    } catch (e) {
        console.error('Error reading dev overrides:', e);
        return undefined;
    }
}

function fetchJsonWithFallback(primaryUrl, fallbackUrl, callback) {
    fetch(primaryUrl)
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((json) => callback(json))
        .catch(() => {
            if (!fallbackUrl) {
                callback(null);
                return;
            }
            fetch(fallbackUrl)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then((json) => callback(json))
                .catch(() => callback(null));
        });
}

function loadLevelIndex(level, callback) {
    if (LEVEL_INDEX_CACHE.has(level)) {
        callback(LEVEL_INDEX_CACHE.get(level));
        return;
    }

    const primaryUrl = `data/dist/${level}/index.json`;
    const fallbackUrl = `data/dist/${level}/index.js`;

    fetchJsonWithFallback(primaryUrl, fallbackUrl, (indexData) => {
        const normalizedIndex = (!indexData || typeof indexData !== 'object' || Array.isArray(indexData)) ? {} : indexData;

        LEVEL_INDEX_CACHE.set(level, normalizedIndex);
        callback(normalizedIndex);
    });
}

function loadDayData(level, day, callback) {
    const cacheKey = getDayCacheKey(level, day);
    if (DAY_DATA_CACHE.has(cacheKey)) {
        callback(DAY_DATA_CACHE.get(cacheKey));
        return;
    }

    const primaryUrl = `data/dist/${level}/day-${day}.json`;
    const fallbackUrl = `data/dist/${level}/day-${day}.js`;

    fetchJsonWithFallback(primaryUrl, fallbackUrl, (fileData) => {
        const merged = normalizeDayData(level, day, getOverrideData(level, day) || fileData || {});
        DAY_DATA_CACHE.set(cacheKey, merged);
        callback(merged);
    });
}

function getMergedDayData(level, day, fileData) {
    return normalizeDayData(level, day, getOverrideData(level, day) || fileData || {});
}
