/**
 * quiz-controller.js
 * 기능: 퀴즈 정답 체크 및 피드백 표시
 */

function checkAnswer(btn) {
    const isCorrect = btn.dataset.isCorrect === 'true';
    const correctIdx = btn.dataset.correctIdx; 
    const comment = btn.dataset.comment;

    const parent = btn.parentElement; // .quiz-options-grid
    const feedbackEl = parent.nextElementSibling; // .quiz-feedback
    const allBtns = parent.querySelectorAll('.quiz-opt-btn');

    // 이미 푼 문제는 다시 클릭 방지
    if (parent.classList.contains('solved')) return;
    parent.classList.add('solved');

    // 모든 버튼 비활성화 및 정답 표시
    allBtns.forEach((b, idx) => {
        b.classList.add('disabled');
        if (idx == correctIdx) b.classList.add('correct');
    });

    // 선택한 버튼에 대한 스타일 및 피드백 메시지 설정
    if (isCorrect) {
        btn.classList.add('correct');
        feedbackEl.innerHTML = `<strong>⭕ 정답입니다!</strong>${comment}`;
        feedbackEl.classList.add('visible');
    } else {
        btn.classList.add('wrong');
        feedbackEl.innerHTML = `<strong>❌ 아쉽네요!</strong>정답은 ${parseInt(correctIdx)+1}번 입니다.<br>${comment}`;
        feedbackEl.classList.add('visible');
    }
}