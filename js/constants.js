/**
 * constants.js
 * 기능: 애플리케이션 전역 상수 정의 (스토리지 키, TTS 설정, 데이터 경로, UI 설정)
 */

const STORAGE_KEYS = {
    LAST_LEVEL: 'last_level',
    BOOKMARKS: 'JLPT_BOOKMARKS',
    DEV_OVERRIDE: 'JLPT_DEV_DATA_OVERRIDE',
    lastModule: (level) => `${level}_last_module`,
    moduleComplete: (level, moduleId) => `${level}_module_${moduleId}_complete`,
    vocabProgress: (level, base, idx) => `${level}_${base}_v_${idx}`,
};

const TTS_CONFIG = {
    PLAYBACK_RATE: 0.9,
    FALLBACK_DELAY_MS: 50,
};

const DATA_PATHS = {
    DIST: 'data/dist',
};

const UI_CONFIG = {
    MOBILE_BREAKPOINT_PX: 768,
};
