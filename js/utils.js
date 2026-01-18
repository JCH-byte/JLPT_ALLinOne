/**
 * utils.js
 * 기능: URL 파라미터 파싱, TTS(음성 합성) 관리
 */

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// ----------------------------------------------------
// TTS (Text-to-Speech) 기능
// ----------------------------------------------------
let availableVoices = [];

if (window.speechSynthesis) {
    // 음성 목록이 로드되면 캐싱
    window.speechSynthesis.onvoiceschanged = () => {
        availableVoices = window.speechSynthesis.getVoices();
    };
}

function speak(text) {
    if (!text) return;

    // HTML 태그 및 후리가나(rt, rp) 제거
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('rt, rp').forEach(el => el.remove());
    const cleanText = tempDiv.textContent || tempDiv.innerText;

    window.speechSynthesis.cancel(); // 기존 음성 중단

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9; // 속도 조절

    // 음성 목록이 비어있으면 다시 로드 시도
    if (availableVoices.length === 0) {
        availableVoices = window.speechSynthesis.getVoices();
    }

    // 일본어 음성 우선순위 선택 (Google > Microsoft > 기타)
    const jpVoices = availableVoices.filter(voice => voice.lang === 'ja-JP' || voice.lang === 'ja_JP');
    let selectedVoice = jpVoices.find(v => v.name.includes('Google'))
                     || jpVoices.find(v => v.name.includes('Microsoft'))
                     || jpVoices.find(v => v.name.includes('Hattori'))
                     || jpVoices.find(v => v.name.includes('O-ren'))
                     || jpVoices[0];

    if (selectedVoice) utterance.voice = selectedVoice;
    
    window.speechSynthesis.speak(utterance);
}