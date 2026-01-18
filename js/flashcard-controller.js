/**
 * flashcard-controller.js
 * 기능: 플래시카드 모드 렌더링, 카드 넘기기, 뒤집기
 */

let currentCardIndex = 0;
let cardData = [];

// 데이터 초기화 및 첫 카드 표시
function renderFlashcards(vocab) { 
    cardData = vocab; 
    currentCardIndex = 0; 
    showFlashcard(0); 
}

// 특정 인덱스의 카드 표시
function showFlashcard(index) {
    if (!cardData || cardData.length === 0) return;
    
    // 인덱스 범위 체크
    if (index < 0) index = 0; 
    if (index >= cardData.length) index = cardData.length - 1;
    
    currentCardIndex = index;
    const v = cardData[index];
    
    const card = document.getElementById('flashcard');
    const counter = document.getElementById('card-counter');
    
    if (card) {
        const front = card.querySelector('.card-front');
        const back = card.querySelector('.card-back');
        
        // 카드 내용 주입
        if(front) {
            front.innerHTML = `
                <div class="fc-word">${v.word}</div>
                <div class="fc-read">${v.read||v.reading||''}</div>
                <div class="fc-hint">클릭해서 뜻 확인</div>
            `;
        }
        if(back) {
            back.innerHTML = `
                <div class="fc-mean">${v.mean||v.meaning}</div>
                <div class="fc-actions">
                    <button onclick="speak('${v.word}'); event.stopPropagation();">🔊 발음 듣기</button>
                </div>
            `;
        }
        // 새 카드로 넘어가면 앞면이 보이도록 초기화
        card.classList.remove('flipped');
    }
    
    if (counter) {
        counter.textContent = `${index + 1} / ${cardData.length}`;
    }
}

function flipCard() { 
    const card = document.getElementById('flashcard'); 
    if(card) card.classList.toggle('flipped'); 
}

function prevCard() { showFlashcard(currentCardIndex - 1); }

function nextCard() { showFlashcard(currentCardIndex + 1); }