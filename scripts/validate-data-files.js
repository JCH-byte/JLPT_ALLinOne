#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const levels = ['n1', 'n2', 'n3', 'n4', 'n5'];
const dataDir = path.join(__dirname, '..', 'data');
let hasError = false;

function fail(msg) {
    console.error(`❌ ${msg}`);
    hasError = true;
}

levels.forEach((level) => {
    const filePath = path.join(dataDir, `${level}_data.js`);

    if (!fs.existsSync(filePath)) {
        fail(`Missing file: data/${level}_data.js`);
        return;
    }

    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
        fail(`Empty file: data/${level}_data.js`);
        return;
    }

    const match = raw.match(new RegExp(`var\\s+${level.toUpperCase()}_DATA\\s*=\\s*([\\s\\S]*);\\s*$`));
    if (!match) {
        fail(`Invalid variable declaration in data/${level}_data.js (expected var ${level.toUpperCase()}_DATA = ...;)`);
        return;
    }

    try {
        const parsed = JSON.parse(match[1]);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            fail(`Invalid data shape in data/${level}_data.js (top-level must be object)`);
            return;
        }

        const days = Object.keys(parsed);
        if (days.length === 0) {
            fail(`No day entries in data/${level}_data.js`);
        }
    } catch (err) {
        fail(`JSON parse failed for data/${level}_data.js: ${err.message}`);
    }
});

if (hasError) {
    process.exit(1);
}

console.log('✅ All level data files exist and are non-empty with valid var declarations.');
