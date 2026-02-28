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
            vocab: dayData,
            quiz: []
        };
    }

    return {
        title: dayData?.title || `Day ${day} 단어장`,
        story: dayData?.story || null,
        analysis: dayData?.analysis || [],
        vocab: dayData?.vocab || [],
        quiz: dayData?.quiz || []
    };
}

function normalizeForLevel(level, day, dayData) {
    return normalizeDay(day, dayData);
}

function normalizeVocabItem(item) {
    return {
        word: item?.word || '',
        read: item?.read || '',
        mean: item?.mean || '',
        tags: Array.isArray(item?.tags) ? item.tags : []
    };
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

function buildDaysFromItems(level, items, maxDay) {
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
        dayMap[key].vocab.push(normalizeVocabItem(item));
    });

    return dayMap;
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
    const normalized = buildDaysFromItems(level, itemSource.items, maxDay);

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
            source: `data/src/${level}.items.json`
        },
        days: {}
    };

    Object.entries(normalized).forEach(([day, dayData]) => {
        if (!shouldIncludeDay(level, day)) return;
        const fileName = `day-${day}.json`;
        expectedFiles.set(fileName, stableStringify(dayData));
        indexData.days[day] = { title: dayData.title };
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
