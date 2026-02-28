#!/usr/bin/env node
/**
 * generate-module-files.js
 *
 * Reads each level's items.json and generates module src files in
 * content/modules/src/{level}-module-{NNN}.json.
 *
 * Each module contains ~25 vocab items (1 NotebookLM session).
 * Module count per level:
 *   N4:  870 items → ~35 modules
 *   N3: 1744 items → ~70 modules
 *   N2: 2162 items → ~87 modules
 *   N1: 2297 items → ~92 modules
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_SRC_DIR = path.join(PROJECT_ROOT, 'data', 'src');
const MODULES_SRC_DIR = path.join(PROJECT_ROOT, 'content', 'modules', 'src');

const ITEMS_PER_MODULE = 25;
const PROMPT_TEMPLATE_VERSION = 'notebooklm-v2';

const LEVELS = [
    { level: 'n4', jlptLevel: 'N4', ruleFile: 'n4-module-default.json' },
    { level: 'n3', jlptLevel: 'N3', ruleFile: 'n3-module-default.json' },
    { level: 'n2', jlptLevel: 'N2', ruleFile: 'n2-module-default.json' },
    { level: 'n1', jlptLevel: 'N1', ruleFile: 'n1-module-default.json' },
];

function stableStringify(data) {
    return `${JSON.stringify(data, null, 4)}\n`;
}

function padNum(n, width = 3) {
    return String(n).padStart(width, '0');
}

/**
 * Splits an array into chunks of approximately targetSize.
 * The last chunk may be slightly larger or smaller to avoid tiny tails.
 */
function chunkItems(items, targetSize) {
    if (items.length === 0) return [];

    const chunkCount = Math.round(items.length / targetSize);
    if (chunkCount <= 1) return [items.slice()];

    const chunks = [];
    const baseSize = Math.floor(items.length / chunkCount);
    const remainder = items.length % chunkCount;

    let cursor = 0;
    for (let i = 0; i < chunkCount; i++) {
        const size = baseSize + (i < remainder ? 1 : 0);
        chunks.push(items.slice(cursor, cursor + size));
        cursor += size;
    }

    return chunks;
}

function getAssignedDay(item) {
    return typeof item.assignedDay === 'number' ? item.assignedDay : 999;
}

function buildModuleTitle(levelUpper, moduleIndex, chunk) {
    const days = chunk.map(getAssignedDay).filter((d) => d !== 999);
    const minDay = days.length > 0 ? Math.min(...days) : '?';
    const maxDay = days.length > 0 ? Math.max(...days) : '?';
    const dayLabel = minDay === maxDay ? `Day ${minDay}` : `Day ${minDay}-${maxDay}`;
    return `${levelUpper} 모듈 ${padNum(moduleIndex + 1)} (${dayLabel})`;
}

function buildModuleSrc(levelInfo, moduleIndex, chunk) {
    const { level, jlptLevel, ruleFile } = levelInfo;
    const moduleId = `${level}-module-${padNum(moduleIndex + 1)}`;

    return {
        moduleId,
        title: buildModuleTitle(jlptLevel, moduleIndex, chunk),
        vocabIds: chunk.map((item) => item.id),
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        constraints: {
            jlptLevel,
            maxNewItemsPerSet: 10,
        },
        ruleFile,
    };
}

function processLevel(levelInfo) {
    const { level, jlptLevel } = levelInfo;
    const itemsPath = path.join(DATA_SRC_DIR, `${level}.items.json`);

    if (!fs.existsSync(itemsPath)) {
        console.warn(`  [SKIP] ${level}.items.json not found at ${itemsPath}`);
        return 0;
    }

    const raw = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    const items = raw.items || [];

    // Sort by assignedDay (ascending), then by original order (stable)
    const sorted = [...items].sort((a, b) => getAssignedDay(a) - getAssignedDay(b));

    const chunks = chunkItems(sorted, ITEMS_PER_MODULE);
    console.log(`  ${jlptLevel}: ${items.length} items → ${chunks.length} modules (~${ITEMS_PER_MODULE} each)`);

    // Remove existing module files for this level
    const existingFiles = fs.readdirSync(MODULES_SRC_DIR)
        .filter((f) => f.startsWith(`${level}-module-`) && f.endsWith('.json'));
    existingFiles.forEach((f) => {
        fs.unlinkSync(path.join(MODULES_SRC_DIR, f));
    });
    if (existingFiles.length > 0) {
        console.log(`    Removed ${existingFiles.length} existing module file(s)`);
    }

    chunks.forEach((chunk, i) => {
        const moduleSrc = buildModuleSrc(levelInfo, i, chunk);
        const outPath = path.join(MODULES_SRC_DIR, `${moduleSrc.moduleId}.json`);
        fs.writeFileSync(outPath, stableStringify(moduleSrc));
    });

    console.log(`    Generated ${chunks.length} module files`);
    return chunks.length;
}

function main() {
    console.log('=== generate-module-files.js ===\n');

    if (!fs.existsSync(MODULES_SRC_DIR)) {
        fs.mkdirSync(MODULES_SRC_DIR, { recursive: true });
    }

    let totalModules = 0;
    LEVELS.forEach((levelInfo) => {
        totalModules += processLevel(levelInfo);
    });

    console.log(`\nDone. Total modules generated: ${totalModules}`);
    console.log('Next: node scripts/build-modules.js');
}

main();
