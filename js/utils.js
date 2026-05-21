/**
 * utils.js
 * 기능: URL 파라미터 파싱, TTS(음성 합성) 관리, 공용 유틸리티
 */

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// JSON 파싱 (실패 시 기본값 반환)
function parseJsonSafe(str, defaultValue = null) {
    try { return JSON.parse(str); } catch { return defaultValue; }
}

// ----------------------------------------------------
// 레거시 키 마이그레이션 (1회 실행, idempotent)
// N5는 과거 day 기반 식별자(day1, day2, ...)로 진행도/북마크가 저장됐음.
// 새 구조에서는 module 기반(n5-module-001, ...)으로 통일.
// 매핑: day N ↔ n5-module-{pad3(N)}  (data/src/n5/modules/* 와 일치)
// ----------------------------------------------------
const STORAGE_MIGRATION_FLAG = 'JLPT_STORAGE_MIGRATION_V1';

function migrateLegacyStorageKeys() {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(STORAGE_MIGRATION_FLAG) === 'true') return;

    let movedKeys = 0;
    let migratedBookmarks = 0;

    try {
        // 1) localStorage key 변환: n5_day{N}_v_{idx} → n5_n5-module-{NNN}_v_{idx},
        //    n5_day{N}_complete → n5_n5-module-{NNN}_complete
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        const pad3 = (n) => String(n).padStart(3, '0');
        for (const k of keys) {
            const vocabMatch = k && k.match(/^n5_day(\d+)_v_(\d+)$/);
            if (vocabMatch) {
                const [, day, idx] = vocabMatch;
                const newKey = `n5_n5-module-${pad3(day)}_v_${idx}`;
                if (localStorage.getItem(newKey) == null) {
                    localStorage.setItem(newKey, localStorage.getItem(k));
                }
                localStorage.removeItem(k);
                movedKeys++;
                continue;
            }
            const completeMatch = k && k.match(/^n5_day(\d+)_complete$/);
            if (completeMatch) {
                const [, day] = completeMatch;
                const newKey = `n5_module_n5-module-${pad3(day)}_complete`;
                if (localStorage.getItem(newKey) == null) {
                    localStorage.setItem(newKey, localStorage.getItem(k));
                }
                localStorage.removeItem(k);
                movedKeys++;
            }
        }

        // 2) 북마크 b.day 가 숫자(N5 레거시)면 b.day = 'n5-module-{NNN}' 로 갱신
        const rawBookmarks = localStorage.getItem('JLPT_BOOKMARKS');
        if (rawBookmarks) {
            const list = parseJsonSafe(rawBookmarks, []);
            if (Array.isArray(list)) {
                let changed = false;
                for (const b of list) {
                    if (!b || typeof b !== 'object') continue;
                    if (b.level === 'n5' && /^\d+$/.test(String(b.day || ''))) {
                        b.day = `n5-module-${pad3(b.day)}`;
                        migratedBookmarks++;
                        changed = true;
                    }
                }
                if (changed) localStorage.setItem('JLPT_BOOKMARKS', JSON.stringify(list));
            }
        }

        localStorage.setItem(STORAGE_MIGRATION_FLAG, 'true');
        if (movedKeys || migratedBookmarks) {
            console.info(`[migration] storage keys moved: ${movedKeys}, bookmarks migrated: ${migratedBookmarks}`);
        }
    } catch (e) {
        console.warn('[migration] storage key migration failed (will retry next load):', e);
    }
}

// HTML 특수문자 이스케이프 (XSS 방지)
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

// ----------------------------------------------------
// TTS (Text-to-Speech) 기능
// 모든 기기: Google Translate TTS 사용 / 실패 시 Web Speech API로 fallback
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
    audio.playbackRate = TTS_CONFIG.PLAYBACK_RATE;
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
        utterance.rate = TTS_CONFIG.PLAYBACK_RATE;

        const voices = window.speechSynthesis.getVoices();
        const jpVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
        const selectedVoice = jpVoices.find(v => v.name.includes('Google'))
                           || jpVoices.find(v => v.name.includes('Microsoft'))
                           || jpVoices[0];
        if (selectedVoice) utterance.voice = selectedVoice;

        window.speechSynthesis.speak(utterance);
    }, TTS_CONFIG.FALLBACK_DELAY_MS);
}
