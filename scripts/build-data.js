#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const levels = ['n1', 'n2', 'n3', 'n4', 'n5'];
const srcDir = path.join(__dirname, '..', 'data', 'src');
const distDir = path.join(__dirname, '..', 'data', 'dist');
const checkMode = process.argv.includes('--check');
const DEFAULT_N4_MAX_DAY = 28;
const MAX_DAY_LIMIT = 28;
const DEFAULT_MAX_DAY = 28;
const ASSIGNMENT_VERSION = 'item-assignment-v1';
const MODULE_METADATA_PATH = path.join(srcDir, 'module-metadata.json');
const DEFAULT_EXPOSURE_TARGET_BY_LEVEL = {
    n5: 3,
    n4: 3,
    n3: 4,
    n2: 4,
    n1: 4
};
const REVIEW_OFFSETS = [2, 5, 8];

function resolveN4MaxDay() {
    const configured = process.env.N4_MAX_DAY;
    if (!configured) return DEFAULT_N4_MAX_DAY;

    const parsed = Number(configured);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAY_LIMIT) {
        throw new Error(
            `Invalid N4_MAX_DAY: ${configured}. Expected an integer between 1 and ${MAX_DAY_LIMIT}.`
        );
    }

    return parsed;
}

const N4_MAX_DAY = resolveN4MaxDay();

function normalizeDay(day, dayData) {
    if (Array.isArray(dayData)) {
        return {
            title: `Day ${day} 단어장`,
            story: null,
            analysis: [],
            vocab: [],
            quiz: []
        };
    }

    return {
        title: dayData?.title || `Day ${day} 단어장`,
        story: dayData?.story || null,
        analysis: dayData?.analysis || [],
        vocab: [],
        quiz: dayData?.quiz || []
    };
}

function normalizeForLevel(level, day, dayData) {
    return normalizeDay(day, dayData);
}

function normalizeVocabItem(item, moduleId, assignedDay) {
    const fallbackTarget = DEFAULT_EXPOSURE_TARGET_BY_LEVEL[item?.level] || 3;
    const introModule = typeof item?.introModule === 'string' && item.introModule.trim()
        ? item.introModule.trim()
        : moduleId;
    const reviewModules = Array.isArray(item?.reviewModules)
        ? item.reviewModules.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
        : [];
    const exposureCountTarget = Number.isInteger(item?.exposureCountTarget)
        ? item.exposureCountTarget
        : fallbackTarget;

    return {
        word: item?.word || '',
        read: item?.read || '',
        mean: item?.mean || '',
        tags: Array.isArray(item?.tags) ? item.tags : [],
        moduleId,
        legacyDay: assignedDay,
        introModule,
        reviewModules,
        exposureCountTarget
    };
}

function buildExposurePlan(level, item, assignedDay, moduleMetadata, maxDay) {
    const fallbackTarget = DEFAULT_EXPOSURE_TARGET_BY_LEVEL[level] || 3;
    const requestedTarget = Number.isInteger(item?.exposureCountTarget) ? item.exposureCountTarget : fallbackTarget;
    const exposureCountTarget = Math.min(4, Math.max(3, requestedTarget));
    const introModule = moduleMetadata.dayToModule[String(assignedDay)] || makeDefaultModuleId(level, assignedDay);

    if (Array.isArray(item?.reviewModules) && item.reviewModules.length > 0) {
        const reviewModules = item.reviewModules
            .filter((entry) => typeof entry === 'string' && entry.trim())
            .map((entry) => entry.trim());
        return { introModule, reviewModules, exposureCountTarget };
    }

    const reviewCount = exposureCountTarget - 1;
    const reviewModules = [];

    for (let idx = 0; idx < reviewCount; idx += 1) {
        const offset = REVIEW_OFFSETS[idx] || (REVIEW_OFFSETS[REVIEW_OFFSETS.length - 1] + ((idx - REVIEW_OFFSETS.length + 1) * 3));
        const reviewDay = ((assignedDay - 1 + offset) % maxDay) + 1;
        const reviewModuleId = moduleMetadata.dayToModule[String(reviewDay)] || makeDefaultModuleId(level, reviewDay);
        if (reviewModuleId !== introModule && !reviewModules.includes(reviewModuleId)) {
            reviewModules.push(reviewModuleId);
        }
    }

    return { introModule, reviewModules, exposureCountTarget };
}

function parseDayHint(dayHint) {
    if (typeof dayHint !== 'string') return null;
    const match = dayHint.match(/(?:legacy-)?day-(\d+)/i);
    if (!match) return null;
    return Number(match[1]);
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getDifficultyScore(item) {
    const text = `${item?.word || ''}${item?.mean || ''}`;
    const tags = Array.isArray(item?.tags) ? item.tags.map(tag => String(tag).toLowerCase()) : [];
    if (tags.some(tag => tag.includes('hard') || tag.includes('어려움'))) return 2;
    if (tags.some(tag => tag.includes('easy') || tag.includes('쉬움'))) return 0;
    return text.length > 10 ? 2 : (text.length > 6 ? 1 : 0);
}

function getPosScore(item) {
    const tags = Array.isArray(item?.tags) ? item.tags.map(tag => String(tag).toLowerCase()) : [];
    if (tags.some(tag => tag.includes('verb') || tag.includes('동사'))) return 2;
    if (tags.some(tag => tag.includes('adj') || tag.includes('형용사'))) return 1;
    return 0;
}

function getFrequencyScore(item) {
    const tags = Array.isArray(item?.tags) ? item.tags.map(tag => String(tag).toLowerCase()) : [];
    if (tags.some(tag => tag.includes('rare') || tag.includes('저빈도'))) return 2;
    if (tags.some(tag => tag.includes('common') || tag.includes('고빈도'))) return 0;
    return 1;
}

function decideAssignedDay(level, item, itemIndex, maxDay) {
    if (Number.isInteger(item?.assignedDay) && item.assignedDay >= 1) {
        return Math.min(item.assignedDay, maxDay);
    }

    const hintedDay = parseDayHint(item?.dayHint);
    if (Number.isInteger(hintedDay) && hintedDay >= 1) {
        return Math.min(hintedDay, maxDay);
    }

    const levelWeight = Number(level.replace('n', '')) || 5;
    const difficultyWeight = getDifficultyScore(item);
    const posWeight = getPosScore(item);
    const frequencyWeight = getFrequencyScore(item);
    const deterministicNoise = hashString(`${item?.id || ''}/${item?.word || ''}/${item?.read || ''}`) % maxDay;
    const mixed = itemIndex + (difficultyWeight * 7) + (posWeight * 5) + (frequencyWeight * 3) + deterministicNoise + (levelWeight * 11);

    return (mixed % maxDay) + 1;
}

function makeDefaultModuleId(level, day) {
    return `${level}-module-${String(day).padStart(3, '0')}`;
}

function buildFallbackMetadata(level, maxDay) {
    const modules = [];
    const dayToModule = {};
    for (let day = 1; day <= maxDay; day += 1) {
        const moduleId = makeDefaultModuleId(level, day);
        dayToModule[String(day)] = moduleId;
        modules.push({
            moduleId,
            level,
            theme: `Legacy Day ${day}`,
            communicativeGoal: `Legacy day-${day} 학습 내용 이관`,
            targetGrammar: [`day-${day}`],
            legacyDay: day
        });
    }
    return { modules, dayToModule, moduleToDay: Object.fromEntries(Object.entries(dayToModule).map(([day, moduleId]) => [moduleId, Number(day)])) };
}

function readModuleMetadata(level, maxDay) {
    const metadata = readJsonOrNull(MODULE_METADATA_PATH);
    const levelData = metadata?.levels?.[level];
    if (!levelData || typeof levelData !== 'object') {
        return buildFallbackMetadata(level, maxDay);
    }

    const modules = Array.isArray(levelData.modules) ? levelData.modules : [];
    const moduleById = new Map();
    modules.forEach((moduleMeta) => {
        if (!moduleMeta || typeof moduleMeta !== 'object') return;
        const moduleId = String(moduleMeta.moduleId || '').trim();
        if (!moduleId) return;
        const legacyDay = Number(moduleMeta.legacyDay);
        moduleById.set(moduleId, {
            moduleId,
            level,
            theme: moduleMeta.theme || `Legacy ${moduleId}`,
            communicativeGoal: moduleMeta.communicativeGoal || '',
            targetGrammar: Array.isArray(moduleMeta.targetGrammar) ? moduleMeta.targetGrammar : [],
            legacyDay: Number.isInteger(legacyDay) && legacyDay > 0 ? legacyDay : null,
            title: moduleMeta.title || ''
        });
    });

    const rawDayToModule = (levelData.dayToModule && typeof levelData.dayToModule === 'object') ? levelData.dayToModule : {};
    const dayToModule = {};
    Object.entries(rawDayToModule).forEach(([day, moduleId]) => {
        if (!moduleById.has(moduleId)) return;
        const numericDay = Number(day);
        if (!Number.isInteger(numericDay) || numericDay < 1 || numericDay > maxDay) return;
        dayToModule[String(numericDay)] = moduleId;
    });

    for (let day = 1; day <= maxDay; day += 1) {
        const key = String(day);
        if (dayToModule[key]) continue;
        const fallbackModuleId = makeDefaultModuleId(level, day);
        dayToModule[key] = fallbackModuleId;
        if (!moduleById.has(fallbackModuleId)) {
            moduleById.set(fallbackModuleId, {
                moduleId: fallbackModuleId,
                level,
                theme: `Legacy Day ${day}`,
                communicativeGoal: `Legacy day-${day} 학습 내용 이관`,
                targetGrammar: [`day-${day}`],
                legacyDay: day,
                title: ''
            });
        }
    }

    const moduleToDay = {};
    Object.entries(dayToModule).forEach(([day, moduleId]) => {
        moduleToDay[moduleId] = Number(day);
    });

    const normalizedModules = Array.from(moduleById.values())
        .sort((a, b) => {
            const aDay = Number(a.legacyDay) || Number(moduleToDay[a.moduleId]) || Number.MAX_SAFE_INTEGER;
            const bDay = Number(b.legacyDay) || Number(moduleToDay[b.moduleId]) || Number.MAX_SAFE_INTEGER;
            if (aDay !== bDay) return aDay - bDay;
            return a.moduleId.localeCompare(b.moduleId);
        });

    return { modules: normalizedModules, dayToModule, moduleToDay };
}

function buildDaysFromItems(level, items, maxDay, moduleMetadata) {
    const dayMap = {};
    for (let day = 1; day <= maxDay; day += 1) {
        dayMap[String(day)] = {
            title: `Day ${day} 단어장`,
            story: null,
            analysis: [],
            vocab: [],
            quiz: []
        };
    }

    items.forEach((item, index) => {
        const assignedDay = decideAssignedDay(level, item, index, maxDay);
        const key = String(assignedDay);
        const moduleId = moduleMetadata.dayToModule[key] || makeDefaultModuleId(level, assignedDay);
        const exposurePlan = buildExposurePlan(level, item, assignedDay, moduleMetadata, maxDay);
        dayMap[key].vocab.push(normalizeVocabItem({ ...item, ...exposurePlan }, moduleId, assignedDay));
    });

    return dayMap;
}


function validateExposurePolicy(level, dayMap, moduleMetadata) {
    const issues = [];
    Object.entries(dayMap).forEach(([day, dayData]) => {
        const vocab = Array.isArray(dayData?.vocab) ? dayData.vocab : [];
        const expectedIntroModule = moduleMetadata.dayToModule[String(day)] || makeDefaultModuleId(level, Number(day));
        vocab.forEach((item, index) => {
            const label = item?.word || item?.read || `index-${index}`;
            const target = Number.isInteger(item?.exposureCountTarget) ? item.exposureCountTarget : 0;
            const reviews = Array.isArray(item?.reviewModules) ? item.reviewModules : [];
            if (typeof item?.introModule !== 'string' || item.introModule.trim() === '') {
                issues.push(`${level} day-${day} ${label}: introModule is required`);
            } else if (item.introModule !== expectedIntroModule) {
                issues.push(`${level} day-${day} ${label}: introModule(${item.introModule}) must match assigned module(${expectedIntroModule})`);
            }

            if (target < 3 || target > 4) {
                issues.push(`${level} day-${day} ${label}: exposureCountTarget must be 3~4`);
            }

            if (reviews.length < 2 || reviews.length > 3) {
                issues.push(`${level} day-${day} ${label}: reviewModules must contain 2~3 modules`);
            }

            if (target > 0 && reviews.length !== (target - 1)) {
                issues.push(`${level} day-${day} ${label}: reviewModules length(${reviews.length}) must equal exposureCountTarget-1(${target - 1})`);
            }
        });
    });

    if (issues.length > 0) {
        const preview = issues.slice(0, 10).join('; ');
        throw new Error(`Exposure policy validation failed for ${level} (${issues.length}): ${preview}`);
    }
}

function stableStringify(data) {
    return `${JSON.stringify(data, null, 4)}\n`;
}

function shouldIncludeDay(level, day) {
    const numericDay = Number(day);
    if (!Number.isFinite(numericDay)) return false;
    if (level === 'n4' && numericDay > N4_MAX_DAY) return false;
    return true;
}

function readJsonOrNull(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildLevel(level) {
    const legacySrcPath = path.join(srcDir, `${level}.json`);
    const itemSrcPath = path.join(srcDir, `${level}.items.json`);
    const levelDistDir = path.join(distDir, level);

    const itemSource = readJsonOrNull(itemSrcPath);
    if (!itemSource || !Array.isArray(itemSource.items)) {
        throw new Error(`Missing or invalid item source file: data/src/${level}.items.json`);
    }

    const maxDay = level === 'n4' ? N4_MAX_DAY : DEFAULT_MAX_DAY;
    const moduleMetadata = readModuleMetadata(level, maxDay);
    const normalized = buildDaysFromItems(level, itemSource.items, maxDay, moduleMetadata);
    validateExposurePolicy(level, normalized, moduleMetadata);

    const legacySource = readJsonOrNull(legacySrcPath);
    if (legacySource && typeof legacySource === 'object' && !Array.isArray(legacySource)) {
        for (const [day, dayData] of Object.entries(legacySource)) {
            if (!normalized[day]) continue;
            const legacyNormalized = normalizeForLevel(level, day, dayData);
            normalized[day] = {
                ...legacyNormalized,
                vocab: normalized[day].vocab
            };
        }
    }

    const expectedFiles = new Map();
    const indexData = {
        manifest: {
            assignmentVersion: ASSIGNMENT_VERSION,
            source: `data/src/${level}.items.json`,
            learningUnit: 'module'
        },
        modules: {},
        days: {},
        dayToModule: {},
        moduleToDay: moduleMetadata.moduleToDay
    };

    moduleMetadata.modules.forEach((moduleMeta) => {
        indexData.modules[moduleMeta.moduleId] = {
            moduleId: moduleMeta.moduleId,
            level: moduleMeta.level,
            theme: moduleMeta.theme,
            communicativeGoal: moduleMeta.communicativeGoal,
            targetGrammar: moduleMeta.targetGrammar,
            legacyDay: moduleMeta.legacyDay,
            title: moduleMeta.title || ''
        };
    });

    Object.entries(normalized).forEach(([day, dayData]) => {
        if (!shouldIncludeDay(level, day)) return;
        const fileName = `day-${day}.json`;
        expectedFiles.set(fileName, stableStringify(dayData));
        const moduleId = moduleMetadata.dayToModule[day] || makeDefaultModuleId(level, Number(day));
        indexData.days[day] = { title: dayData.title, moduleId };
        indexData.dayToModule[day] = moduleId;
        if (!indexData.modules[moduleId]) {
            indexData.modules[moduleId] = {
                moduleId,
                level,
                theme: `Legacy Day ${day}`,
                communicativeGoal: `Legacy day-${day} 학습 내용 이관`,
                targetGrammar: [`day-${day}`],
                legacyDay: Number(day),
                title: dayData.title
            };
        } else if (!indexData.modules[moduleId].title) {
            indexData.modules[moduleId].title = dayData.title;
        }
    });

    expectedFiles.set('index.json', stableStringify(indexData));

    const legacyDistPath = path.join(distDir, `${level}_data.js`);
    if (checkMode) {
        if (fs.existsSync(legacyDistPath)) {
            throw new Error(`Stale legacy file found: data/dist/${level}_data.js`);
        }
    } else {
        fs.rmSync(legacyDistPath, { force: true });
    }

    if (checkMode) {
        if (!fs.existsSync(levelDistDir)) {
            throw new Error(`Missing generated folder: data/dist/${level}`);
        }

        for (const [fileName, expected] of expectedFiles.entries()) {
            const filePath = path.join(levelDistDir, fileName);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Missing generated file: data/dist/${level}/${fileName}`);
            }
            const current = fs.readFileSync(filePath, 'utf8');
            if (current !== expected) {
                throw new Error(`Out-of-date file: data/dist/${level}/${fileName} (run: node scripts/build-data.js)`);
            }
        }

        const currentFiles = fs.readdirSync(levelDistDir).filter(name => name.endsWith('.json') || name.endsWith('.js'));
        const expectedNames = new Set(expectedFiles.keys());
        const staleFiles = currentFiles.filter(name => !expectedNames.has(name));
        if (staleFiles.length > 0) {
            throw new Error(`Stale generated files in data/dist/${level}: ${staleFiles.join(', ')}`);
        }
        return;
    }

    fs.rmSync(levelDistDir, { recursive: true, force: true });
    fs.mkdirSync(levelDistDir, { recursive: true });

    for (const [fileName, content] of expectedFiles.entries()) {
        const outputPath = path.join(levelDistDir, fileName);
        fs.writeFileSync(outputPath, content, 'utf8');
    }
}

try {
    levels.forEach(buildLevel);
    console.log(checkMode ? '✅ data/dist is in sync with data/src.' : '✅ Built data/dist from data/src item sources.');
} catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
}
