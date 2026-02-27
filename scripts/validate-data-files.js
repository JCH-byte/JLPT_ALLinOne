#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const checks = [
    path.join(__dirname, 'build-data.js'),
    path.join(__dirname, 'build-modules.js'),
    path.join(__dirname, 'validate-module-batches.js')
];

for (const scriptPath of checks) {
    const args = scriptPath.endsWith('validate-module-batches.js') ? [] : ['--check'];
    const result = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
    if ((result.status ?? 1) !== 0) {
        process.exit(result.status ?? 1);
    }
}
