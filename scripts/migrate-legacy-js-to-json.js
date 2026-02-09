#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REQUIRED_KEYS = ['title', 'story', 'vocab', 'analysis', 'quiz'];

const SOURCES = [
    { file: 'n3_data.js', globalName: 'N3_DATA', level: 'n3' },
    { file: 'n4_data.js', globalName: 'N4_DATA', level: 'n4' },
    { file: 'n5_data.js', globalName: 'N5_DATA', level: 'n5' }
];

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SRC_DIR = path.join(DATA_DIR, 'src');
const DIST_DIR = path.join(DATA_DIR, 'dist');

const formatArg = process.argv.find(arg => arg.startsWith('--format='));
const outputFormat = formatArg ? formatArg.split('=')[1] : 'src';

if (!['src', 'dist'].includes(outputFormat)) {
    console.error('❌ Invalid --format value. Use --format=src or --format=dist');
    process.exit(1);
}

function safeExtractGlobal(filePath, globalName) {
    const code = fs.readFileSync(filePath, 'utf8');
    const sandbox = Object.create(null);
    vm.createContext(sandbox);

    const script = new vm.Script(`${code}\n;globalThis.__EXTRACTED__ = ${globalName};`, {
        filename: path.basename(filePath)
    });

    script.runInContext(sandbox, { timeout: 1000 });
    return sandbox.__EXTRACTED__;
}

function normalizeDay(day, dayData) {
    if (Array.isArray(dayData)) {
        return {
            title: `Day ${day} 단어장`,
            story: null,
            vocab: dayData,
            analysis: [],
            quiz: []
        };
    }

    const normalized = {
        title: dayData?.title ?? `Day ${day} 단어장`,
        story: dayData?.story ?? null,
        vocab: dayData?.vocab ?? [],
        analysis: dayData?.analysis ?? [],
        quiz: dayData?.quiz ?? []
    };

    return normalized;
}

function stableStringify(data) {
    return `${JSON.stringify(data, null, 4)}\n`;
}

function sortDayEntries(entries) {
    return [...entries].sort((a, b) => Number(a[0]) - Number(b[0]));
}

function toMissingKeyReport(dayData) {
    const missing = [];
    for (const key of REQUIRED_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(dayData, key)) {
            missing.push(key);
        }
    }
    return missing;
}

function writeSrcFormat(level, normalizedByDay) {
    fs.mkdirSync(SRC_DIR, { recursive: true });
    const outputPath = path.join(SRC_DIR, `${level}.json`);
    fs.writeFileSync(outputPath, stableStringify(normalizedByDay), 'utf8');
    return [path.relative(ROOT, outputPath)];
}

function writeDistFormat(level, normalizedByDay) {
    const levelDir = path.join(DIST_DIR, level);
    fs.mkdirSync(levelDir, { recursive: true });

    const written = [];
    const indexData = {};

    for (const [day, dayData] of sortDayEntries(Object.entries(normalizedByDay))) {
        indexData[day] = { title: dayData.title };
        const dayPath = path.join(levelDir, `day-${day}.json`);
        fs.writeFileSync(dayPath, stableStringify(dayData), 'utf8');
        written.push(path.relative(ROOT, dayPath));
    }

    const indexPath = path.join(levelDir, 'index.json');
    fs.writeFileSync(indexPath, stableStringify(indexData), 'utf8');
    written.push(path.relative(ROOT, indexPath));

    return written;
}

function migrateOne({ file, globalName, level }) {
    const inputPath = path.join(DATA_DIR, file);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing input file: ${path.relative(ROOT, inputPath)}`);
    }

    const extracted = safeExtractGlobal(inputPath, globalName);
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
        throw new Error(`Invalid extracted data from ${file}: expected object`);
    }

    const missingReport = [];
    const normalizedByDay = {};

    for (const [day, dayData] of sortDayEntries(Object.entries(extracted))) {
        const rawDayData = Array.isArray(dayData) ? { vocab: dayData } : (dayData || {});
        const missing = toMissingKeyReport(rawDayData);
        if (missing.length > 0) {
            missingReport.push({ day, missing });
        }
        normalizedByDay[day] = normalizeDay(day, dayData);
    }

    const writtenFiles = outputFormat === 'dist'
        ? writeDistFormat(level, normalizedByDay)
        : writeSrcFormat(level, normalizedByDay);

    return { level, writtenFiles, missingReport };
}

try {
    const summaries = SOURCES.map(migrateOne);

    for (const summary of summaries) {
        console.log(`✅ ${summary.level}: wrote ${summary.writtenFiles.length} file(s)`);
        summary.writtenFiles.forEach(file => console.log(`   - ${file}`));

        if (summary.missingReport.length === 0) {
            console.log('   - 필수 키 누락 없음');
            continue;
        }

        console.log(`   - 필수 키 누락 ${summary.missingReport.length}건`);
        summary.missingReport.forEach(item => {
            console.log(`     • day ${item.day}: ${item.missing.join(', ')}`);
        });
    }

    console.log(`\n✅ Migration complete (format: ${outputFormat})`);
} catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
}
