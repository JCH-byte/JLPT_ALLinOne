/**
 * shared-field-aliases.js (Node.js CommonJS)
 * 기능: 필드 별칭 정규화 — data-service.js(브라우저)와 lint-data.js(Node) 간의 중복 제거
 */

const FIELD_ALIASES = {
    reading: 'read',
    meaning: 'mean',
    question: 'q',
    options: 'opt'
};

function normalizeItemKeys(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const normalized = { ...item };

    Object.entries(FIELD_ALIASES).forEach(([legacyKey, canonicalKey]) => {
        if (normalized[canonicalKey] == null && normalized[legacyKey] != null) {
            normalized[canonicalKey] = normalized[legacyKey];
        }
    });

    return normalized;
}

module.exports = { FIELD_ALIASES, normalizeItemKeys };
