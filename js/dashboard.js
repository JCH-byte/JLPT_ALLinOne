/**
 * dashboard.js
 * 기능: 메인 대시보드 로직 (레벨 전환, 진척도 관리, 네비게이션)
 * 의존성: data-service.js (loadLevelIndex)
 */

let currentLevel = localStorage.getItem(STORAGE_KEYS.LAST_LEVEL) || 'n4';

function initDashboard() {
    if (typeof migrateLegacyStorageKeys === 'function') migrateLegacyStorageKeys();
    switchLevel(currentLevel);
}

function switchLevel(level) {
    currentLevel = level;
    localStorage.setItem(STORAGE_KEYS.LAST_LEVEL, level);

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
    const order = Array.isArray(indexData?.moduleOrder) ? indexData.moduleOrder : [];
    const modulesMeta = indexData?.modules || {};
    return order.map((moduleId) => {
        const meta = modulesMeta[moduleId] || {};
        return {
            moduleId,
            ordinal: Number(meta.ordinal) || 0,
            title: meta.title || '',
            hasContent: meta.hasContent !== false
        };
    });
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
        const { moduleId, ordinal, title, hasContent } = entry;
        const checkKey = STORAGE_KEYS.moduleComplete(level, moduleId);
        const isDone = localStorage.getItem(checkKey) === 'true';
        const fallbackTitle = `Module ${moduleId}`;
        const baseTitle = (typeof title === 'string' && title.trim()) ? title.trim() : fallbackTitle;
        if (isDone) doneCount++;

        const li = document.createElement('li');
        const stateClass = [
            'day-item',
            isDone ? 'completed' : '',
            hasContent ? '' : 'no-content'
        ].filter(Boolean).join(' ');
        li.className = stateClass;
        li.id = `nav-module-${moduleId}`;
        const subLabel = hasContent ? `#${ordinal}` : `#${ordinal} (단어만)`;
        li.innerHTML = `
            <div class="day-info" onclick="loadFrame('${level}', '${moduleId}')">
                <span class="module-num">${ordinal}</span>
                <span class="title-text" style="font-weight:bold;">${baseTitle}</span>
                <span class="day-sub">${subLabel}</span>
            </div>
            <label class="check-complete">
                <input type="checkbox" onchange="toggleComplete('${level}', '${moduleId}', this)" ${isDone ? 'checked' : ''}>
                완료
            </label>
        `;
        list.appendChild(li);
    });

    const lastModule = localStorage.getItem(STORAGE_KEYS.lastModule(level));
    const frame = document.getElementById('content-frame');
    const isStarredPage = frame && frame.src && frame.src.includes('starred.html');

    if (lastModule && modules.some((entry) => entry.moduleId === lastModule) && !isStarredPage) {
        loadFrame(level, lastModule);
    }

    updateProgress(level, doneCount, modules.length);
}

function loadFrame(level, moduleId) {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = `viewer.html?level=${level}&module=${encodeURIComponent(moduleId)}`;

    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.getElementById(`nav-module-${moduleId}`);
    if (activeItem) {
        activeItem.classList.add('active');
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    localStorage.setItem(STORAGE_KEYS.lastModule(level), moduleId);

    if (window.innerWidth <= UI_CONFIG.MOBILE_BREAKPOINT_PX) toggleSidebar();
}

function loadStarredPage() {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = 'starred.html';

    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));

    if (window.innerWidth <= UI_CONFIG.MOBILE_BREAKPOINT_PX) toggleSidebar();
}

function toggleComplete(level, moduleId, checkbox) {
    const key = STORAGE_KEYS.moduleComplete(level, moduleId);
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
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('show');
    if (overlay) overlay.classList.toggle('active');
}

function toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (window.innerWidth <= UI_CONFIG.MOBILE_BREAKPOINT_PX) {
        sidebar.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// 뷰어에서 네비게이션 시 사이드바 활성화 상태 업데이트를 위해 전역 함수로 노출
window.updateSidebarActive = function(level, moduleId) {
    if (!moduleId) return;
    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.getElementById(`nav-module-${moduleId}`);
    if (activeItem) {
        activeItem.classList.add('active');
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    localStorage.setItem(STORAGE_KEYS.lastModule(level), moduleId);
};

document.addEventListener('DOMContentLoaded', initDashboard);
