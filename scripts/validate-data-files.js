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
const MIN_EXPOSURE_BY_LEVEL = { n1: 4, n2: 4, n3: 4, n4: 3, n5: 3 };
const MIN_REEXPOSURE_GAP_BY_LEVEL = { n1: 2, n2: 2, n3: 2, n4: 2, n5: 2 };

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function classifySentenceType(text) {
    const source = String(text || '').trim();
    if (!source) return 'descriptive';
    if (/\?$|？$|\b(인가요|습니까|나요)\b/.test(source)) return 'question';
    if (/(해\s*주세요|해\s*주십시오|하십시오|하세요|해라|해 줘|してください|しましょう|てください)/.test(source)) return 'request';
    if (/(보다|처럼|같이|보다도|より|ほど|よりも)/.test(source)) return 'comparison';
    return 'descriptive';
}

function getSentenceText(entry) {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object') return '';
    return entry.text || entry.sentence || entry.question || entry.q || '';
}

function validateItemToDistDayConsistency() {
    const report = {
        missingIntroductionWords: [],
        overRepeatedWords: [],
        contextBiasedWords: []
    };

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

                const target = Number.isInteger(entry?.exposureCountTarget) ? entry.exposureCountTarget : null;
                const reviewModules = Array.isArray(entry?.reviewModules) ? entry.reviewModules : [];
                if (!entry?.introModule || target == null) {
                    report.missingIntroductionWords.push(`${level} day-${day} ${key}`);
                }
                if (target != null && reviewModules.length > (target - 1)) {
                    report.overRepeatedWords.push(`${level} day-${day} ${key} (target=${target}, reviewModules=${reviewModules.length})`);
                }

                const minExposure = MIN_EXPOSURE_BY_LEVEL[level] || 3;
                if (target != null && target < minExposure) {
                    report.missingIntroductionWords.push(`${level} day-${day} ${key} (target=${target} < min=${minExposure})`);
                }

                const minGap = MIN_REEXPOSURE_GAP_BY_LEVEL[level] || 2;
                const introModuleDay = Number(String(entry?.introModule || '').split('-').pop());
                if (Number.isFinite(introModuleDay) && reviewModules.length > 0) {
                    reviewModules.forEach((moduleId) => {
                        const reviewDay = Number(String(moduleId).split('-').pop());
                        if (!Number.isFinite(reviewDay)) return;
                        const diff = Math.abs(reviewDay - introModuleDay);
                        if (diff < minGap) {
                            report.overRepeatedWords.push(`${level} day-${day} ${key} (gap=${diff} < minGap=${minGap})`);
                        }
                    });
                }
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

    const moduleFiles = fs.readdirSync(path.join(rootDir, 'content', 'modules', 'src')).filter((name) => name.endsWith('.json')).sort();
    moduleFiles.forEach((fileName) => {
        const moduleJson = readJson(path.join(rootDir, 'content', 'modules', 'src', fileName));
        const batches = Array.isArray(moduleJson.generationBatches) ? moduleJson.generationBatches : [];
        const outputs = moduleJson.notebookLMOutputs && typeof moduleJson.notebookLMOutputs === 'object' ? moduleJson.notebookLMOutputs : {};

        batches.forEach((batch) => {
            const output = outputs[batch.batchId];
            if (!output || output.reviewed !== true) return;
            const types = new Set();
            (Array.isArray(output.sentences) ? output.sentences : []).forEach((entry) => {
                types.add(classifySentenceType(getSentenceText(entry)));
            });
            if (types.size <= 1) {
                const vocabIds = Array.isArray(batch.vocabIds) ? batch.vocabIds : [];
                vocabIds.forEach((vocabId) => {
                    report.contextBiasedWords.push(`${fileName}:${batch.batchId}:${vocabId}`);
                });
            }
        });
    });

    const uniq = (arr) => Array.from(new Set(arr));
    report.missingIntroductionWords = uniq(report.missingIntroductionWords);
    report.overRepeatedWords = uniq(report.overRepeatedWords);
    report.contextBiasedWords = uniq(report.contextBiasedWords);

    console.log('📊 Validation report');
    console.log(`- 미도입 단어: ${report.missingIntroductionWords.length}`);
    report.missingIntroductionWords.slice(0, 20).forEach((entry) => console.log(`  • ${entry}`));
    console.log(`- 과도 반복 단어: ${report.overRepeatedWords.length}`);
    report.overRepeatedWords.slice(0, 20).forEach((entry) => console.log(`  • ${entry}`));
    console.log(`- 문맥 편중 단어: ${report.contextBiasedWords.length}`);
    report.contextBiasedWords.slice(0, 20).forEach((entry) => console.log(`  • ${entry}`));

    if (report.missingIntroductionWords.length > 0 || report.overRepeatedWords.length > 0 || report.contextBiasedWords.length > 0) {
        throw new Error('Validation report contains unresolved vocabulary exposure/context issues.');
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
