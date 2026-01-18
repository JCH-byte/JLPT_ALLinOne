/**
 * dashboard.js
 * 기능: 메인 대시보드 로직 (레벨 전환, 진척도 관리, 네비게이션)
 * 의존성: data-service.js (loadLevelData, getMergedData)
 */

let currentLevel = localStorage.getItem('last_level') || 'n4';

function initDashboard() {
    switchLevel(currentLevel);
}

// 레벨 전환 및 데이터 로드
function switchLevel(level) {
    currentLevel = level;
    localStorage.setItem('last_level', level);
    
    // 테마 적용 (사이드바 색상 변경 등 - base.css/dashboard.css 연동)
    document.body.setAttribute('data-theme', level);
    
    // 탭 활성화 UI 처리
    document.querySelectorAll('.tab-btn').forEach(btn => {
        // 텍스트 비교 시 대소문자 주의
        btn.classList.toggle('active', btn.textContent.toLowerCase() === level);
    });
    
    const titleEl = document.getElementById('level-title');
    if(titleEl) titleEl.textContent = `${level.toUpperCase()} 진행률`;

    // data-service.js의 함수를 사용하여 데이터 로드
    if (typeof loadLevelData === 'function') {
        loadLevelData(level, (fileData) => {
            renderList(level, fileData);
        });
    } else {
        console.error("data-service.js가 로드되지 않았습니다.");
    }
}

// Day 목록 렌더링
function renderList(level, fileData) {
    const list = document.getElementById('day-list');
    list.innerHTML = '';

    // 데이터 병합 (data-service.js)
    const allData = getMergedData(level, fileData);
    
    // Day 번호 기준 정렬
    const days = Object.keys(allData).sort((a,b) => parseInt(a) - parseInt(b));

    if (days.length === 0) {
        list.innerHTML = `<li style="padding:20px; text-align:center; color:#666;">
            아직 ${level.toUpperCase()} 데이터 파일이 없습니다.<br>
            <code>data/${level}_data.js</code>를 생성해주세요.
        </li>`;
        updateProgress(level, 0, 0);
        return;
    }

    let doneCount = 0;
    days.forEach(day => {
        const data = allData[day];
        // 완료 여부 체크 (LocalStorage)
        const checkKey = `${level}_day${day}_complete`;
        const isDone = localStorage.getItem(checkKey) === 'true';
        if(isDone) doneCount++;

        const li = document.createElement('li');
        li.className = `day-item ${isDone ? 'completed' : ''}`;
        li.id = `nav-day-${day}`;
        li.innerHTML = `
            <div class="day-info" onclick="loadFrame('${level}', '${day}')">
                <span style="font-weight:bold;">Day ${day}</span>
                <span style="display:block; font-size:0.8rem; color:#666;">${data.title}</span>
            </div>
            <label class="check-complete">
                <input type="checkbox" onchange="toggleComplete('${level}', '${day}', this)" ${isDone?'checked':''}>
                완료
            </label>
        `;
        list.appendChild(li);
    });

    // 마지막 방문 위치로 자동 이동 (Starred 페이지가 아닐 경우만)
    const lastDay = localStorage.getItem(`${level}_last_day`);
    const frame = document.getElementById('content-frame');
    const isStarredPage = frame && frame.src && frame.src.includes('starred.html');

    if (lastDay && allData[lastDay] && !isStarredPage) {
         // 페이지 로드 시 한 번만 실행하거나, 탭 전환 시마다 실행할지는 기획에 따라 결정
         // 여기서는 탭 전환 시 자동 로드 (UX상 호불호가 갈릴 수 있음, 필요 시 조건 추가)
         loadFrame(level, lastDay);
    }

    updateProgress(level, doneCount, days.length);
}

// 아이프레임 네비게이션
function loadFrame(level, day) {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = `viewer.html?level=${level}&day=${day}`;
    
    // 사이드바 선택 효과 갱신
    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.getElementById(`nav-day-${day}`);
    if(activeItem) activeItem.classList.add('active');
    
    // 마지막 위치 저장
    localStorage.setItem(`${level}_last_day`, day);
    
    // 모바일에서 선택 후 사이드바 닫기
    if(window.innerWidth <= 768) toggleSidebar();
}

// 나만의 단어장 페이지 로드
function loadStarredPage() {
    const frame = document.getElementById('content-frame');
    if (!frame) return;

    frame.src = 'starred.html';
    
    // 사이드바 선택 해제
    document.querySelectorAll('.day-item').forEach(el => el.classList.remove('active'));
    
    if(window.innerWidth <= 768) toggleSidebar();
}

// 완료 체크박스 토글
function toggleComplete(level, day, checkbox) {
    const key = `${level}_day${day}_complete`;
    if(checkbox.checked) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
    
    // 진행률 갱신을 위해 레벨 다시 로드 (혹은 효율화를 위해 UI만 갱신 가능)
    switchLevel(level); 
}

// 진행률 바 업데이트
function updateProgress(level, done, total) {
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    const textEl = document.getElementById('progress-text');
    const barEl = document.getElementById('progress-bar');
    
    if(textEl) textEl.textContent = `${percent}%`;
    if(barEl) barEl.style.width = `${percent}%`;
}

// 모바일 사이드바 토글
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.toggle('show');
}

// 초기화 이벤트 리스너
document.addEventListener('DOMContentLoaded', initDashboard);