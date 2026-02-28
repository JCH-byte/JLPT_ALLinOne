#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const checks = [
    path.join(__dirname, 'build-data.js'),
    path.join(__dirname, 'build-modules.js'),
    path.join(__dirname, 'validate-module-batches.js')
];

const levels = ['n1', 'n2', 'n3', 'n4', 'n5'];
const rootDir = path.join(__dirname, '..');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateItemToDistDayConsistency() {
    for (const level of levels) {
        const itemPath = path.join(rootDir, 'data', 'src', `${level}.items.json`);
        const indexPath = path.join(rootDir, 'data', 'dist', level, 'index.json');

        if (!fs.existsSync(itemPath)) {
            throw new Error(`Missing item source file: data/src/${level}.items.json`);
        }
        if (!fs.existsSync(indexPath)) {
            throw new Error(`Missing dist index file: data/dist/${level}/index.json`);
        }

        const itemSource = readJson(itemPath);
        if (!Array.isArray(itemSource.items)) {
            throw new Error(`Invalid item source shape: data/src/${level}.items.json (items must be array)`);
        }

        const indexJson = readJson(indexPath);
        const dayIndex = (indexJson?.days && typeof indexJson.days === 'object' && !Array.isArray(indexJson.days))
            ? indexJson.days
            : indexJson;

        for (const day of Object.keys(dayIndex)) {
            const dayPath = path.join(rootDir, 'data', 'dist', level, `day-${day}.json`);
            if (!fs.existsSync(dayPath)) {
                throw new Error(`Missing day file listed in index: data/dist/${level}/day-${day}.json`);
            }
        }

        const itemToExpectedDay = new Map();
        itemSource.items.forEach((item) => {
            const key = item?.id || `${item?.word || ''}/${item?.read || ''}/${item?.mean || ''}`;
            if (!Number.isInteger(item?.assignedDay)) {
                throw new Error(`Item missing assignedDay in data/src/${level}.items.json: ${key}`);
            }
            itemToExpectedDay.set(key, item.assignedDay);
        });

        const itemToActualDays = new Map();
        Object.keys(dayIndex).forEach((day) => {
            const dayPath = path.join(rootDir, 'data', 'dist', level, `day-${day}.json`);
            const dayJson = readJson(dayPath);
            const vocab = Array.isArray(dayJson?.vocab) ? dayJson.vocab : [];
            vocab.forEach((entry) => {
                const key = `${entry?.word || ''}/${entry?.read || ''}/${entry?.mean || ''}`;
                const hits = itemToActualDays.get(key) || [];
                hits.push(Number(day));
                itemToActualDays.set(key, hits);
            });
        });

        for (const item of itemSource.items) {
            const sourceKey = item?.id || `${item?.word || ''}/${item?.read || ''}/${item?.mean || ''}`;
            const fallbackKey = `${item?.word || ''}/${item?.read || ''}/${item?.mean || ''}`;
            const expectedDay = item.assignedDay;
            const actualDays = itemToActualDays.get(sourceKey) || itemToActualDays.get(fallbackKey) || [];
            if (actualDays.length === 0) {
                throw new Error(`Item not found in dist day files: ${level} ${sourceKey}`);
            }
            if (!actualDays.includes(expectedDay)) {
                throw new Error(`Inconsistent assignment: ${level} ${sourceKey} expected day ${expectedDay}, actual days [${actualDays.join(', ')}]`);
            }
        }
    }
}

for (const scriptPath of checks) {
    const args = scriptPath.endsWith('validate-module-batches.js') ? [] : ['--check'];
    const result = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
    if ((result.status ?? 1) !== 0) {
        process.exit(result.status ?? 1);
    }
}

try {
    validateItemToDistDayConsistency();
    console.log('✅ Source item → dist day consistency check passed.');
} catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
}
