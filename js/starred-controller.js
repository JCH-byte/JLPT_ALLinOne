/**
 * starred-controller.js
 * 기능: 나만의 단어장(북마크) 페이지 필터링, 렌더링, 삭제 기능
 * 의존성: utils.js (speak), bookmark-service.js (getBookmarks, toggleStar)
 */

let currentFilter = 'all';

function initStarredPage() {
    setFilter('all');
}

// 필터 설정 (급수별 보기)
function setFilter(filter) {
    currentFilter = filter;
    
    // 탭 UI 업데이트
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const text = btn.textContent.toLowerCase();
        // '전체' 버튼과 나머지 레벨 버튼 구분 처리
        const isActive = (filter === 'all' && text === '전체') || (text === filter);
        btn.classList.toggle('active', isActive);
    });

    // 테마 색상 업데이트 (레벨별 색상 적용)
    if(filter !== 'all') document.body.setAttribute('data-theme', filter);
    else document.body.removeAttribute('data-theme');

    refreshStarredList();
}

// 리스트 새로고침 (핵심 로직)
function refreshStarredList() {
    // bookmark-service.js의 함수 사용
    const bookmarks = getBookmarks();
    
    // 최신순 정렬 (addedAt 기준 내림차순)
    bookmarks.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));

    const tbody = document.getElementById('vocab-tbody');
    const emptyMsg = document.getElementById('empty-msg');
    const table = document.getElementById('vocab-table');

    if (!tbody) return;
    tbody.innerHTML = '';

    let count = 0;
    bookmarks.forEach(item => {
        // 필터링
        if (currentFilter !== 'all' && item.level !== currentFilter) return;

        count++;
        const tr = document.createElement('tr');
        
        // 데이터 전달을 위한 JSON 이스케이프
        const vJson = JSON.stringify(item).replace(/"/g, '&quot;');
        
        tr.innerHTML = `
            <td class="col-star">
                <button type="button" class="star-btn active" 
                        onclick="removeAndRefresh('${item.level}', '${item.day}', ${vJson})">
                    ★
                </button>
            </td>
            <td style="text-align:center;">
                <span class="badge-level" style="font-size:0.7rem; padding:2px 6px;">
                    ${item.level.toUpperCase()}
                </span>
            </td>
            <td class="col-word" onclick="speak('${item.word}')">🔊 ${item.word}</td>
            <td class="col-read">${item.read}</td>
            <td class="col-mean"><span>${item.mean}</span></td>
            <td style="text-align:center;">
                <a href="viewer.html?level=${item.level}&day=${item.day}" class="tool-btn" style="text-decoration:none; font-size:0.8rem;">
                    Day ${item.day}
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 데이터 유무에 따른 UI 처리
    if (count === 0) {
        if(table) table.style.display = 'none';
        if(emptyMsg) emptyMsg.style.display = 'block';
    } else {
        if(table) table.style.display = 'table'; // 모바일 CSS에서 block으로 덮어씌워질 수 있음
        if(emptyMsg) emptyMsg.style.display = 'none';
    }
}

// 단어 삭제 후 리스트 갱신 래퍼 함수
function removeAndRefresh(level, day, item) {
    // bookmark-service.js의 toggleStar 함수 호출 (이미 존재하므로 삭제됨)
    toggleStar(level, day, item, null);
    
    // 리스트 다시 그리기
    refreshStarredList();
}

// UI 헬퍼: 뜻 가리기 토글 (viewer.js에 있는 것과 유사하지만 독립적으로 동작)
function toggleMeanings() {
    const table = document.getElementById('vocab-table');
    const btn = document.getElementById('btn-toggle-mean');
    if(table && btn) {
        const isHidden = table.classList.toggle('hide-meanings');
        btn.textContent = isHidden ? "👀 뜻 보이기" : "🙈 뜻 가리기";
        btn.classList.toggle('active', isHidden);
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', initStarredPage);