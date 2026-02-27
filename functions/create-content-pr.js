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

function validatePayload(payload) {
    const required = ['level', 'day', 'version', 'dataHash', 'data'];
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
    const recalculated = computeDataHash(payload);
    if (recalculated !== payload.dataHash) {
        throw new Error(`dataHash mismatch: expected ${recalculated}, received ${payload.dataHash}`);
    }
}

function updateSourceDay(repoRoot, payload) {
    const srcPath = path.join(repoRoot, 'data', 'src', `${payload.level}.json`);
    const raw = fs.readFileSync(srcPath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed[String(payload.day)] = payload.data;
    fs.writeFileSync(srcPath, `${JSON.stringify(parsed, null, 4)}\n`, 'utf8');
}

function buildPrBody(payload, branchName) {
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
        validatePayload(payload);

        const repoRoot = process.env.REPO_ROOT || process.cwd();
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const baseBranch = process.env.GITHUB_BASE_BRANCH || 'main';
        const token = process.env.GITHUB_TOKEN;

        if (!owner || !repo || !token) {
            throw new Error('Missing env: GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN are required');
        }

        const branchName = `automation/${payload.level}-day-${String(payload.day).padStart(2, '0')}-v${payload.version}-${payload.dataHash.slice(0, 8)}`;

        run('git', ['checkout', baseBranch], repoRoot);
        run('git', ['pull', '--ff-only', 'origin', baseBranch], repoRoot);
        run('git', ['checkout', '-b', branchName], repoRoot);

        updateSourceDay(repoRoot, payload);
        run('node', ['scripts/build-data.js'], repoRoot);

        run('git', ['add', `data/src/${payload.level}.json`, `data/dist/${payload.level}`], repoRoot);
        run('git', ['commit', '-m', `chore(data): update ${payload.level} day ${payload.day} (v${payload.version})`], repoRoot, {
            GIT_AUTHOR_NAME: payload.author || 'content-admin-bot',
            GIT_AUTHOR_EMAIL: 'content-admin-bot@example.com',
            GIT_COMMITTER_NAME: 'content-admin-bot',
            GIT_COMMITTER_EMAIL: 'content-admin-bot@example.com'
        });
        run('git', ['push', '-u', 'origin', branchName], repoRoot);

        const title = `chore(data): ${payload.level.toUpperCase()} day ${payload.day} update (v${payload.version})`;
        const body = buildPrBody(payload, branchName);

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
    computeDataHash,
    updateSourceDay
};
