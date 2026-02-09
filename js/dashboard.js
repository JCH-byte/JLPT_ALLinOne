/**
 * dashboard.js
 * 기능: 메인 대시보드 로직 (레벨 전환, 진척도 관리, 네비게이션)
 * 의존성: data-service.js (loadLevelIndex)
 */

let currentLevel = localStorage.getItem('last_level') || 'n4';

function initDashboard() {
    switchLevel(currentLevel);
}

// 레벨 전환 및 Day 메타데이터 로드
function switchLevel(level) {
    currentLevel = level;
    localStorage.setItem('last_level', level);

    document.body.setAttribute('data-theme', level);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === level);
    });

    const titleEl = document.getElementById('level-title');
    if (titleEl) titleEl.textContent = `${level.toUpperCase()} 진행률`;

    if (typeof loadLevelIndex === 'function') {
        loadLevelIndex(level, (indexData) => {
            renderList(level, indexData);
        });
    } else {
        console.error('data-service.js가 로드되지 않았습니다.');
    }
}

// Day 목록 렌더링 (index 파일: title-only)
function renderList(level, indexData) {
    const list = document.getElementById('day-list');
    list.innerHTML = '';

    const days = Object.keys(indexData || {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (days.length === 0) {
        list.innerHTML = `<li style="padding:20px; text-align:center; color:#666;">
            아직 ${level.toUpperCase()} 데이터 파일이 없습니다.<br>
            <code>data/dist/${level}/index.json</code>를 생성해주세요.
        </li>`;
        updateProgress(level, 0, 0);
        return;
    }

    let doneCount = 0;
    days.forEach(day => {
        const data = indexData[day] || {};
        const checkKey = `${level}_day${day}_complete`;
        const isDone = localStorage.getItem(checkKey) === 'true';
        if (isDone) doneCount++;

        const li = document.createElement('li');
        li.className = `day-item ${isDone ? 'completed' : ''}`;
        li.id = `nav-day-${day}`;
        li.innerHTML = `
            <div class="day-info" onclick="loadFrame('${level}', '${day}')">
                <span style="font-weight:bold;">Day ${day}</span>
                <span style="display:block; font-size:0.8rem; color:#666;">${data.title || `Day ${day} 단어장`}</span>
            </div>
            <label class="check-complete">
                <input type="checkbox" onchange="toggleComplete('${level}', '${day}', this)" ${isDone ? 'checked' : ''}>
                완료
            </label>
        `;
        list.appendChild(li);
    });

    const lastDay = localStorage.getItem(`${level}_last_day`);
    const frame = document.getElementById('content-frame');
    const isStarredPage = frame && frame.src && frame.src.includes('starred.html');

    if (lastDay && indexData[lastDay] && !isStarredPage) {
        loadFrame(level, lastDay);
    }

    updateProgress(level, doneCount, days.length);
}

function loadFrame(level, day) {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = `viewer.html?level=${level}&day=${day}`;

    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.getElementById(`nav-day-${day}`);
    if (activeItem) activeItem.classList.add('active');

    localStorage.setItem(`${level}_last_day`, day);

    if (window.innerWidth <= 768) toggleSidebar();
}

function loadStarredPage() {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = 'starred.html';

    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));

    if (window.innerWidth <= 768) toggleSidebar();
}

function toggleComplete(level, day, checkbox) {
    const key = `${level}_day${day}_complete`;
    if (checkbox.checked) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);

    switchLevel(level);
}

function updateProgress(level, done, total) {
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    const textEl = document.getElementById('progress-text');
    const barEl = document.getElementById('progress-bar');

    if (textEl) textEl.textContent = `${percent}%`;
    if (barEl) barEl.style.width = `${percent}%`;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('show');
}

document.addEventListener('DOMContentLoaded', initDashboard);
