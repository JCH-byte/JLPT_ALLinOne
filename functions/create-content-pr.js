#!/usr/bin/env node
/**
 * Example serverless handler for automated content PR creation.
 * Compatible shape: Cloud Functions / Express style `(req, res)`.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

function run(cmd, args, cwd, extraEnv = {}) {
    const result = spawnSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv }
    });
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
    }
    return (result.stdout || '').trim();
}

function computeDataHash(payload) {
    const jsonText = `${JSON.stringify({ day: Number(payload.day), data: payload.data }, null, 2)}\n`;
    return crypto.createHash('sha256').update(jsonText).digest('hex');
}

function computeModuleDataHash(payload) {
    const jsonText = `${JSON.stringify({ moduleId: payload.moduleId, story: payload.story, analysis: payload.analysis, quiz: payload.quiz }, null, 2)}\n`;
    return crypto.createHash('sha256').update(jsonText).digest('hex');
}

function validatePayload(payload) {
    const required = ['level', 'day', 'version', 'dataHash', 'data', 'itemSource'];
    const missing = required.filter(key => payload[key] === undefined || payload[key] === null);
    if (missing.length > 0) {
        throw new Error(`Missing fields: ${missing.join(', ')}`);
    }
    if (!/^n[1-5]$/.test(String(payload.level))) {
        throw new Error('level must be one of n1..n5');
    }
    if (!Number.isInteger(Number(payload.day)) || Number(payload.day) < 1) {
        throw new Error('day must be a positive integer');
    }
    if (typeof payload.data !== 'object' || Array.isArray(payload.data)) {
        throw new Error('data must be an object');
    }
    if (!Array.isArray(payload.itemSource)) {
        throw new Error('itemSource must be an array');
    }
    const recalculated = computeDataHash(payload);
    if (recalculated !== payload.dataHash) {
        throw new Error(`dataHash mismatch: expected ${recalculated}, received ${payload.dataHash}`);
    }
}

function validateModulePayload(payload) {
    if (!/^n[1-5]$/.test(String(payload.level))) {
        throw new Error('level must be one of n1..n5');
    }
    if (typeof payload.moduleId !== 'string' || !payload.moduleId.trim()) {
        throw new Error('moduleId must be a non-empty string');
    }
    if (!payload.dataHash) {
        throw new Error('Missing field: dataHash');
    }
    if (payload.story == null && !Array.isArray(payload.quiz)) {
        throw new Error('At least story or quiz must be provided');
    }
    const recalculated = computeModuleDataHash(payload);
    if (recalculated !== payload.dataHash) {
        throw new Error(`dataHash mismatch: expected ${recalculated}, received ${payload.dataHash}`);
    }
}

function updateModuleVocabFile(repoRoot, payload) {
    const filePath = path.join(repoRoot, 'data', 'dist', payload.level, 'module-vocab', `${payload.moduleId}.json`);
    let existing = {};
    if (fs.existsSync(filePath)) {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    const merged = { ...existing, title: existing.title || payload.moduleId, moduleId: payload.moduleId };
    if (payload.story != null) merged.story = payload.story;
    if (Array.isArray(payload.analysis)) merged.analysis = payload.analysis;
    if (Array.isArray(payload.quiz)) merged.quiz = payload.quiz;
    fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    return filePath;
}

function buildModulePrBody(payload, branchName) {
    return [
        `Automated content sync for **${payload.level.toUpperCase()} Module ${payload.moduleId}**.`,
        '',
        '## Admin context',
        `- author: ${payload.author || 'unknown'}`,
        `- changeSummary: ${payload.changeSummary || 'N/A'}`,
        '',
        '## PR metadata',
        `- dataHash: ${payload.dataHash}`,
        `- sourceBranch: ${branchName}`
    ].join('\n');
}

function summarizeItemChanges(previousItems, nextItems) {
    const previousMap = new Map(previousItems.map(item => [String(item?.id || ''), item]));
    const nextMap = new Map(nextItems.map(item => [String(item?.id || ''), item]));
    let changedItemCount = 0;
    const touchedDays = new Set();

    nextItems.forEach(nextItem => {
        const id = String(nextItem?.id || '');
        const prevItem = previousMap.get(id);
        if (!prevItem) {
            changedItemCount += 1;
            if (Number.isInteger(nextItem?.assignedDay)) touchedDays.add(nextItem.assignedDay);
            return;
        }
        const prevDay = Number.isInteger(prevItem?.assignedDay) ? prevItem.assignedDay : null;
        const nextDay = Number.isInteger(nextItem?.assignedDay) ? nextItem.assignedDay : null;
        if (JSON.stringify(prevItem) !== JSON.stringify(nextItem)) {
            changedItemCount += 1;
        }
        if (prevDay !== nextDay) {
            if (prevDay) touchedDays.add(prevDay);
            if (nextDay) touchedDays.add(nextDay);
        }
    });

    previousItems.forEach(prevItem => {
        const id = String(prevItem?.id || '');
        if (!nextMap.has(id)) {
            changedItemCount += 1;
            if (Number.isInteger(prevItem?.assignedDay)) touchedDays.add(prevItem.assignedDay);
        }
    });

    return {
        changedItemCount,
        dayRebalancedCount: touchedDays.size
    };
}

function updateSourceDay(repoRoot, payload) {
    const srcPath = path.join(repoRoot, 'data', 'src', `${payload.level}.json`);
    const raw = fs.readFileSync(srcPath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed[String(payload.day)] = payload.data;
    fs.writeFileSync(srcPath, `${JSON.stringify(parsed, null, 4)}\n`, 'utf8');
}

function updateSourceItems(repoRoot, payload) {
    const itemPath = path.join(repoRoot, 'data', 'src', `${payload.level}.items.json`);
    const raw = fs.readFileSync(itemPath, 'utf8');
    const parsed = JSON.parse(raw);
    const previousItems = Array.isArray(parsed.items) ? parsed.items : [];
    parsed.items = payload.itemSource;
    fs.writeFileSync(itemPath, `${JSON.stringify(parsed, null, 4)}\n`, 'utf8');
    return summarizeItemChanges(previousItems, payload.itemSource);
}

function buildPrBody(payload, branchName, changeSummary) {
    return [
        `Automated content sync for **${payload.level.toUpperCase()} Day ${payload.day}** (v${payload.version}).`,
        '',
        '## Admin context',
        `- author: ${payload.author || 'unknown'}`,
        `- changeSummary: ${payload.changeSummary || 'N/A'}`,
        '',
        '## validation-report',
        '```txt',
        String(payload.validationReport || 'N/A').trim(),
        '```',
        '',
        '## change-impact',
        `- changedItems: ${changeSummary.changedItemCount}`,
        `- dayRebalancedCount: ${changeSummary.dayRebalancedCount}`,
        '',
        '## PR metadata',
        `- dataHash: ${payload.dataHash}`,
        `- sourceBranch: ${branchName}`
    ].join('\n');
}

/**
 * Required envs (example):
 * - GITHUB_TOKEN: token with repo scope
 * - GITHUB_OWNER, GITHUB_REPO
 * - GITHUB_BASE_BRANCH (optional, default: main)
 * - REPO_ROOT (optional, default: process.cwd())
 */
async function createContentPr(req, res) {
    try {
        const payload = req.body || {};
        const isModuleMode = payload.moduleId && !payload.day;

        if (isModuleMode) {
            validateModulePayload(payload);
        } else {
            validatePayload(payload);
        }

        const repoRoot = process.env.REPO_ROOT || process.cwd();
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const baseBranch = process.env.GITHUB_BASE_BRANCH || 'main';
        const token = process.env.GITHUB_TOKEN;

        if (!owner || !repo || !token) {
            throw new Error('Missing env: GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN are required');
        }

        run('git', ['checkout', baseBranch], repoRoot);
        run('git', ['pull', '--ff-only', 'origin', baseBranch], repoRoot);

        let branchName, title, body;

        if (isModuleMode) {
            branchName = `automation/${payload.level}-module-${payload.moduleId}-${payload.dataHash.slice(0, 8)}`;
            run('git', ['checkout', '-b', branchName], repoRoot);

            const vocabFilePath = updateModuleVocabFile(repoRoot, payload);
            run('git', ['add', vocabFilePath], repoRoot);
            run('git', ['commit', '-m', `chore(data): update ${payload.level} ${payload.moduleId} story/quiz`], repoRoot, {
                GIT_AUTHOR_NAME: payload.author || 'content-admin-bot',
                GIT_AUTHOR_EMAIL: 'content-admin-bot@example.com',
                GIT_COMMITTER_NAME: 'content-admin-bot',
                GIT_COMMITTER_EMAIL: 'content-admin-bot@example.com'
            });
            run('git', ['push', '-u', 'origin', branchName], repoRoot);

            title = `chore(data): ${payload.level.toUpperCase()} ${payload.moduleId} story/quiz update`;
            body = buildModulePrBody(payload, branchName);
        } else {
            branchName = `automation/${payload.level}-day-${String(payload.day).padStart(2, '0')}-v${payload.version}-${payload.dataHash.slice(0, 8)}`;
            run('git', ['checkout', '-b', branchName], repoRoot);

            updateSourceDay(repoRoot, payload);
            const itemChanges = updateSourceItems(repoRoot, payload);
            run('node', ['scripts/build-data.js'], repoRoot);

            run('git', ['add', `data/src/${payload.level}.json`, `data/src/${payload.level}.items.json`, `data/dist/${payload.level}`], repoRoot);
            run('git', ['commit', '-m', `chore(data): update ${payload.level} day ${payload.day} (v${payload.version})`], repoRoot, {
                GIT_AUTHOR_NAME: payload.author || 'content-admin-bot',
                GIT_AUTHOR_EMAIL: 'content-admin-bot@example.com',
                GIT_COMMITTER_NAME: 'content-admin-bot',
                GIT_COMMITTER_EMAIL: 'content-admin-bot@example.com'
            });
            run('git', ['push', '-u', 'origin', branchName], repoRoot);

            title = `chore(data): ${payload.level.toUpperCase()} day ${payload.day} update (v${payload.version})`;
            body = buildPrBody(payload, branchName, itemChanges);
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                head: branchName,
                base: baseBranch,
                body
            })
        });

        const pr = await response.json();
        if (!response.ok) {
            throw new Error(`GitHub PR create failed: ${JSON.stringify(pr)}`);
        }

        res.status(200).json({
            ok: true,
            prUrl: pr.html_url,
            prNumber: pr.number,
            prState: pr.state,
            branch: branchName,
            title
        });
    } catch (error) {
        res.status(400).json({ ok: false, error: error.message });
    }
}

module.exports = {
    createContentPr,
    validatePayload,
    validateModulePayload,
    computeDataHash,
    computeModuleDataHash,
    updateSourceDay,
    updateModuleVocabFile
};
