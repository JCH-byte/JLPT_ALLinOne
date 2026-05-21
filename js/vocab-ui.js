/**
 * vocab-ui.js
 * 기능: Vocab 테이블 행 렌더링 및 공유 UI 유틸리티
 * 의존성: utils.js (speak, escapeHtml), bookmark-service.js (isStarred, toggleStar), constants.js (STORAGE_KEYS)
 */

// 뜻 가리기 토글 (viewer, starred 공용)
function toggleMeanings() {
    const table = document.getElementById('vocab-table');
    const btn = document.getElementById('btn-toggle-mean');
    if (table && btn) {
        const isHidden = table.classList.toggle('hide-meanings');
        btn.textContent = isHidden ? "👀 뜻 보이기" : "🙈 뜻 가리기";
        btn.classList.toggle('active', isHidden);
    }
}

// tbody._vocabData[idx]로 vocab 객체를 찾아 toggleStar 호출 (JSON-in-attribute 패턴 대체)
function toggleStarByIdx(btn, level, bookmarkKey) {
    const tr = btn.closest('tr');
    const tbody = tr.closest('tbody');
    const idx = parseInt(tr.dataset.vocabIdx, 10);
    const v = tbody._vocabData[idx];
    toggleStar(level, bookmarkKey, v, btn);
}

// viewer.html용 vocab 행 생성
function renderViewerVocabRow(level, bookmarkKey, v, idx, checkId, isChecked, isStar) {
    const tr = document.createElement('tr');
    tr.className = isChecked ? 'checked-row' : '';
    tr.dataset.vocabIdx = idx;

    const wordText = escapeHtml(v.word || '');
    const readText = escapeHtml(v.read || v.reading || '');
    const meanText = escapeHtml(v.mean || v.meaning || '');

    tr.innerHTML = `
        <td class="col-star">
            <button type="button" class="star-btn ${isStar ? 'active' : ''}"
                    onclick="toggleStarByIdx(this, '${escapeHtml(level)}', '${escapeHtml(bookmarkKey)}'); event.stopPropagation();">
                ${isStar ? '★' : '☆'}
            </button>
        </td>
        <td class="col-check"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
        <td class="col-word" onclick="speak('${wordText}')">🔊 ${wordText}</td>
        <td class="col-read">${readText}</td>
        <td class="col-mean"><span>${meanText}</span></td>
    `;

    tr.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        if (e.target.checked) {
            localStorage.setItem(checkId, 'true');
            tr.classList.add('checked-row');
        } else {
            localStorage.removeItem(checkId);
            tr.classList.remove('checked-row');
        }
    });

    return tr;
}

// starred.html용 vocab 행 생성
function renderStarredVocabRow(item) {
    const tr = document.createElement('tr');

    const wordText = escapeHtml(item.word || '');
    const readText = escapeHtml(item.read || '');
    const meanText = escapeHtml(item.mean || '');
    const levelText = escapeHtml(item.level || '');
    // 북마크의 식별자 필드는 'day'를 그대로 두지만 값은 moduleId. 레거시 호환을 위해 day 필드 사용 유지.
    const moduleKey = escapeHtml(String(item.day || ''));
    const moduleOrdinalMatch = moduleKey.match(/-(\d+)$/);
    const labelText = moduleOrdinalMatch ? `Module ${Number(moduleOrdinalMatch[1])}` : '이동';

    tr.innerHTML = `
        <td class="col-star">
            <button type="button" class="star-btn active"
                    onclick="removeAndRefresh('${levelText}', '${moduleKey}', this)">
                ★
            </button>
        </td>
        <td style="text-align:center;">
            <span class="badge-level" style="font-size:0.7rem; padding:2px 6px;">
                ${levelText.toUpperCase()}
            </span>
        </td>
        <td class="col-word" onclick="speak('${wordText}')">🔊 ${wordText}</td>
        <td class="col-read">${readText}</td>
        <td class="col-mean"><span>${meanText}</span></td>
        <td style="text-align:center;">
            <a href="viewer.html?level=${levelText}&module=${moduleKey}" class="tool-btn" style="text-decoration:none; font-size:0.8rem;">
                ${labelText}
            </a>
        </td>
    `;

    // 버튼에 item 객체 저장 (removeAndRefresh에서 사용)
    tr.querySelector('.star-btn')._bookmarkItem = item;

    return tr;
}
