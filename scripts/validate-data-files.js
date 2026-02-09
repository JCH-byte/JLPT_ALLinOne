#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'build-data.js');
const result = spawnSync(process.execPath, [scriptPath, '--check'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
