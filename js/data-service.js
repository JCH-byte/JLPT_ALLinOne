/**
 * data-service.js
 * 기능: Module/Day 단위 데이터 lazy-load, 로컬 데이터 오버라이드 병합
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
        tags: safeArray(item.tags),
        moduleId: safeString(item.moduleId),
        legacyDay: item.legacyDay ?? day
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

    if (normalizedDayData && typeof normalizedDayData === 'object' && !Array.isArray(normalizedDayData)) {
        const nested = normalizedDayData.data;
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            normalizedDayData = nested;
        }
    }

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

function normalizeModuleVocabData(level, moduleId, fileData) {
    const data = fileData || {};
    const vocab = safeArray(data.vocab).map((item, idx) => normalizeVocabItem(level, moduleId, idx, item));
    const quiz = safeArray(data.quiz).map((item, idx) => normalizeQuizItem(level, moduleId, idx, item));
    return {
        title: safeString(data.title) || moduleId,
        story: data.story == null ? null : safeString(data.story),
        analysis: safeArray(data.analysis),
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

function fetchJsonWithFallback(primaryUrl, fallbackUrl, callback, fetchOptions) {
    fetch(primaryUrl, fetchOptions || {})
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
            fetch(fallbackUrl, fetchOptions || {})
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then((json) => callback(json))
                .catch(() => callback(null));
        });
}


function fetchFileExists(primaryUrl, fallbackUrl, callback) {
    fetch(primaryUrl, { method: 'HEAD' })
        .then((res) => {
            if (res.ok) {
                callback(true);
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        })
        .catch(() => {
            if (!fallbackUrl) {
                callback(false);
                return;
            }
            fetch(fallbackUrl, { method: 'HEAD' })
                .then((res) => callback(res.ok))
                .catch(() => callback(false));
        });
}

function filterIndexByExistingDayFiles(level, indexData, callback) {
    const days = Object.keys(indexData || {});
    if (days.length === 0) {
        callback({});
        return;
    }

    Promise.all(days.map((day) => new Promise((resolve) => {
        const dayJson = `data/dist/${level}/day-${day}.json`;
        const dayJs = `data/dist/${level}/day-${day}.js`;
        fetchFileExists(dayJson, dayJs, (exists) => resolve({ day, exists }));
    }))).then((results) => {
        const filtered = {};
        results.forEach(({ day, exists }) => {
            if (exists) filtered[day] = indexData[day];
        });
        callback(filtered);
    });
}

function normalizeLevelIndex(indexData) {
    const normalizedIndex = (!indexData || typeof indexData !== 'object' || Array.isArray(indexData)) ? {} : indexData;
    const days = (normalizedIndex.days && typeof normalizedIndex.days === 'object' && !Array.isArray(normalizedIndex.days))
        ? normalizedIndex.days
        : normalizedIndex;

    return {
        manifest: normalizedIndex.manifest || {},
        modules: (normalizedIndex.modules && typeof normalizedIndex.modules === 'object' && !Array.isArray(normalizedIndex.modules))
            ? normalizedIndex.modules
            : {},
        days,
        dayToModule: (normalizedIndex.dayToModule && typeof normalizedIndex.dayToModule === 'object' && !Array.isArray(normalizedIndex.dayToModule))
            ? normalizedIndex.dayToModule
            : {},
        moduleToDay: (normalizedIndex.moduleToDay && typeof normalizedIndex.moduleToDay === 'object' && !Array.isArray(normalizedIndex.moduleToDay))
            ? normalizedIndex.moduleToDay
            : {},
        moduleToFile: (normalizedIndex.moduleToFile && typeof normalizedIndex.moduleToFile === 'object' && !Array.isArray(normalizedIndex.moduleToFile))
            ? normalizedIndex.moduleToFile
            : {}
    };
}

function loadLevelIndex(level, callback) {
    if (LEVEL_INDEX_CACHE.has(level)) {
        callback(LEVEL_INDEX_CACHE.get(level));
        return;
    }

    const primaryUrl = `data/dist/${level}/index.json`;
    const fallbackUrl = `data/dist/${level}/index.js`;

    fetchJsonWithFallback(primaryUrl, fallbackUrl, (indexData) => {
        const normalized = normalizeLevelIndex(indexData);

        filterIndexByExistingDayFiles(level, normalized.days, (filteredDays) => {
            const filteredDayToModule = {};
            const filteredModuleToDay = {};
            Object.keys(filteredDays).forEach((day) => {
                const explicitModuleId = filteredDays?.[day]?.moduleId;
                const moduleId = explicitModuleId || normalized.dayToModule?.[day];
                if (!moduleId) return;
                filteredDayToModule[day] = moduleId;
                filteredModuleToDay[moduleId] = Number(day);
            });

            const fullIndex = {
                ...normalized,
                days: filteredDays,
                dayToModule: filteredDayToModule,
                moduleToDay: {
                    ...normalized.moduleToDay,
                    ...filteredModuleToDay
                }
            };

            LEVEL_INDEX_CACHE.set(level, fullIndex);
            callback(fullIndex);
        });
    }, { cache: 'no-cache' });
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

function resolveDayByModule(level, moduleId, callback) {
    loadLevelIndex(level, (indexData) => {
        const mapped = indexData?.moduleToDay?.[moduleId];
        if (mapped != null) {
            callback(String(mapped), indexData);
            return;
        }

        const moduleEntry = indexData?.modules?.[moduleId];
        const legacyDay = Number(moduleEntry?.legacyDay);
        if (Number.isInteger(legacyDay) && legacyDay > 0) {
            callback(String(legacyDay), indexData);
            return;
        }

        callback(null, indexData);
    });
}

function loadViewerData(level, params, callback) {
    const preferredModule = params?.module ? String(params.module) : '';
    const fallbackDay = params?.day ? String(params.day) : '';

    if (preferredModule) {
        loadLevelIndex(level, (indexData) => {
            // module-vocab 파일이 있으면 직접 로드 (N4~N1 모듈 시스템)
            const moduleFilePath = indexData?.moduleToFile?.[preferredModule];
            if (moduleFilePath) {
                const deliverData = (rawData) => {
                    const data = normalizeModuleVocabData(level, preferredModule, rawData);
                    callback({
                        data,
                        day: null,
                        moduleId: preferredModule,
                        moduleMeta: indexData?.modules?.[preferredModule] || null,
                        indexData
                    });
                };

                const fetchFromStatic = () => {
                    fetchJsonWithFallback(
                        `data/dist/${level}/${moduleFilePath}.json`, null,
                        deliverData
                    );
                };

                if (window.FirebaseBridge?.getModuleContent) {
                    window.FirebaseBridge.getModuleContent(level, preferredModule)
                        .then(firestoreData => firestoreData ? deliverData(firestoreData) : fetchFromStatic())
                        .catch(fetchFromStatic);
                } else {
                    fetchFromStatic();
                }
                return;
            }

            // 기존: moduleToDay → day-{N}.json (N5 및 레거시)
            resolveDayByModule(level, preferredModule, (resolvedDay, idxData) => {
                if (resolvedDay) {
                    loadDayData(level, resolvedDay, (data) => callback({
                        data,
                        day: resolvedDay,
                        moduleId: preferredModule,
                        moduleMeta: idxData?.modules?.[preferredModule] || null,
                        indexData: idxData
                    }));
                    return;
                }

                if (!fallbackDay) {
                    callback({ data: null, day: null, moduleId: preferredModule, moduleMeta: null, indexData: idxData });
                    return;
                }

                loadDayData(level, fallbackDay, (data) => callback({
                    data,
                    day: fallbackDay,
                    moduleId: idxData?.dayToModule?.[fallbackDay] || '',
                    moduleMeta: null,
                    indexData: idxData
                }));
            });
        });
        return;
    }

    if (!fallbackDay) {
        callback({ data: null, day: null, moduleId: '', moduleMeta: null, indexData: null });
        return;
    }

    loadLevelIndex(level, (indexData) => {
        loadDayData(level, fallbackDay, (data) => callback({
            data,
            day: fallbackDay,
            moduleId: indexData?.dayToModule?.[fallbackDay] || '',
            moduleMeta: null,
            indexData
        }));
    });
}

function getMergedDayData(level, day, fileData) {
    return normalizeDayData(level, day, getOverrideData(level, day) || fileData || {});
}
