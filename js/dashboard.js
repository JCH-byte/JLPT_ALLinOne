/**
 * dashboard.js
 * 기능: 메인 대시보드 로직 (레벨 전환, 진척도 관리, 네비게이션)
 * 의존성: data-service.js (loadLevelIndex)
 */

let currentLevel = localStorage.getItem('last_level') || 'n4';

function initDashboard() {
    switchLevel(currentLevel);
}

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

function getOrderedModules(indexData) {
    const moduleToDay = indexData?.moduleToDay || {};
    const modules = Object.entries(moduleToDay)
        .map(([moduleId, day]) => {
            const meta = indexData?.modules?.[moduleId] || {};
            return {
                moduleId,
                legacyDay: Number(day),
                title: meta.title || ''
            };
        })
        .filter((entry) => Number.isInteger(entry.legacyDay) && entry.legacyDay > 0)
        .sort((a, b) => a.legacyDay - b.legacyDay);

    if (modules.length > 0) return modules;

    return Object.keys(indexData?.days || {})
        .sort((a, b) => Number(a) - Number(b))
        .map((day) => ({
            moduleId: indexData?.days?.[day]?.moduleId || `${currentLevel}-module-${String(day).padStart(3, '0')}`,
            legacyDay: Number(day),
            title: indexData?.days?.[day]?.title || `Day ${day} 단어장`
        }));
}

function renderList(level, indexData) {
    const list = document.getElementById('day-list');
    list.innerHTML = '';

    const modules = getOrderedModules(indexData);

    if (modules.length === 0) {
        list.innerHTML = `<li style="padding:20px; text-align:center; color:#666;">
            아직 ${level.toUpperCase()} 데이터 파일이 없습니다.<br>
            <code>data/dist/${level}/index.json</code>를 생성해주세요.
        </li>`;
        updateProgress(level, 0, 0);
        return;
    }

    let doneCount = 0;
    modules.forEach(entry => {
        const { moduleId, legacyDay, title } = entry;
        const checkKey = `${level}_module_${moduleId}_complete`;
        const isDone = localStorage.getItem(checkKey) === 'true';
        const fallbackTitle = `Module ${moduleId}`;
        const baseTitle = (typeof title === 'string' && title.trim()) ? title.trim() : fallbackTitle;
        if (isDone) doneCount++;

        const li = document.createElement('li');
        li.className = `day-item ${isDone ? 'completed' : ''}`;
        li.id = `nav-module-${moduleId}`;
        li.innerHTML = `
            <div class="day-info" onclick="loadFrame('${level}', '${moduleId}', '${legacyDay}')">
                <span class="module-num">${legacyDay}</span>
                <span class="title-text" style="font-weight:bold;">${baseTitle}</span>
                <span class="day-sub">Day ${legacyDay}</span>
            </div>
            <label class="check-complete">
                <input type="checkbox" onchange="toggleComplete('${level}', '${moduleId}', this)" ${isDone ? 'checked' : ''}>
                완료
            </label>
        `;
        list.appendChild(li);
    });

    const lastModule = localStorage.getItem(`${level}_last_module`);
    const frame = document.getElementById('content-frame');
    const isStarredPage = frame && frame.src && frame.src.includes('starred.html');

    if (lastModule && modules.some((entry) => entry.moduleId === lastModule) && !isStarredPage) {
        const current = modules.find((entry) => entry.moduleId === lastModule);
        loadFrame(level, lastModule, current?.legacyDay || '');
    }

    updateProgress(level, doneCount, modules.length);
}

function loadFrame(level, moduleId, legacyDay) {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    const dayQuery = legacyDay ? `&day=${legacyDay}` : '';
    frame.src = `viewer.html?level=${level}&module=${encodeURIComponent(moduleId)}${dayQuery}`;

    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.getElementById(`nav-module-${moduleId}`);
    if (activeItem) activeItem.classList.add('active');

    localStorage.setItem(`${level}_last_module`, moduleId);

    if (window.innerWidth <= 768) toggleSidebar();
}

function loadStarredPage() {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = 'starred.html';

    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));

    if (window.innerWidth <= 768) toggleSidebar();
}

function toggleComplete(level, moduleId, checkbox) {
    const key = `${level}_module_${moduleId}_complete`;
    if (checkbox.checked) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);

    // iframe 리로드 없이 해당 항목 DOM만 업데이트
    const li = document.getElementById(`nav-module-${moduleId}`);
    if (li) li.classList.toggle('completed', checkbox.checked);

    // 진행률 바 재계산
    const allItems = document.querySelectorAll('.day-item');
    const doneItems = document.querySelectorAll('.day-item.completed');
    updateProgress(level, doneItems.length, allItems.length);
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

function toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

document.addEventListener('DOMContentLoaded', initDashboard);
