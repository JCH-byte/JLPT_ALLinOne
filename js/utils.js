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
// Google Translate TTS 사용 / 실패 시 Web Speech API로 fallback
// ----------------------------------------------------
let currentAudio = null;

function speak(text) {
    if (!text) return;

    // HTML 태그 및 후리가나(rt, rp) 제거
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('rt, rp').forEach(el => el.remove());
    const cleanText = (tempDiv.textContent || tempDiv.innerText).trim();

    if (!cleanText) return;

    // 기존 재생 중단
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=ja&client=tw-ob`;
    const audio = new Audio(url);
    audio.playbackRate = 0.9;
    currentAudio = audio;

    let fallbackCalled = false;
    const tryFallback = () => {
        if (!fallbackCalled) {
            fallbackCalled = true;
            speakFallback(cleanText);
        }
    };

    // 네트워크/CORS 오류는 error 이벤트로 발생 (play() rejection과 별개)
    audio.addEventListener('error', tryFallback);
    audio.play().catch(tryFallback);
}

function speakFallback(cleanText) {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;

        const voices = window.speechSynthesis.getVoices();
        const jpVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
        const selectedVoice = jpVoices.find(v => v.name.includes('Google'))
                           || jpVoices.find(v => v.name.includes('Microsoft'))
                           || jpVoices[0];
        if (selectedVoice) utterance.voice = selectedVoice;

        window.speechSynthesis.speak(utterance);
    }, 50);
}
