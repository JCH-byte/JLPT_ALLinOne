/**
 * bookmark-service.js
 * 기능: 단어 북마크(별표) 저장, 삭제, 조회 (LocalStorage 사용)
 */

const BOOKMARK_KEY = 'JLPT_BOOKMARKS';

function getBookmarks() {
    try {
        return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]');
    } catch (e) { return []; }
}

// 특정 단어가 북마크되어 있는지 확인
function isStarred(level, day, word) {
    const bookmarks = getBookmarks();
    return bookmarks.some(b => b.level === level && b.day == day && b.word === word);
}

// 북마크 토글 (추가/삭제)
function toggleStar(level, day, wordData, btnElement) {
    let bookmarks = getBookmarks();
    const existingIndex = bookmarks.findIndex(b => b.level === level && b.day == day && b.word === wordData.word);
    
    const isActive = existingIndex > -1;

    if (isActive) {
        // 삭제
        bookmarks.splice(existingIndex, 1);
        if(btnElement) {
            btnElement.classList.remove('active');
            btnElement.innerHTML = '☆';
        }
    } else {
        // 추가
        bookmarks.push({
            level: level,
            day: day,
            word: wordData.word,
            read: wordData.read || wordData.reading || '',
            mean: wordData.mean || wordData.meaning || '',
            addedAt: new Date().toISOString()
        });
        if(btnElement) {
            btnElement.classList.add('active');
            btnElement.innerHTML = '★';
        }
    }
    
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
    
    // 모아보기 페이지 등 외부 갱신이 필요한 경우 호출
    if(window.refreshStarredList) window.refreshStarredList();
}