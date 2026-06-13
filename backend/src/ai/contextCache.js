/** In-memory AI context cache — no Supabase dependency (safe for unit tests). */

const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(businessId) {
  const entry = _cache.get(businessId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCache(businessId, data) {
  _cache.set(businessId, { ts: Date.now(), data });
  if (_cache.size > 200) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
}

function invalidateBusinessContext(businessId) {
  _cache.delete(businessId);
}

module.exports = {
  CACHE_TTL_MS,
  getCached,
  setCache,
  invalidateBusinessContext,
};
