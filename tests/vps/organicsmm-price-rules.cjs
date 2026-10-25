// Organic SMM (organicsmm.online) price-consistency rules deployed on the VPS.
// Mirrors src/pages/EngagementOrder.tsx on the VPS:
// 1) Saved ratios from localStorage are sanitized: only finite numbers 0..100,
//    and 'views' is never user-overridden (views IS the base quantity).
// 2) Effective ratio for a type: views is always 100; other types use the
//    sanitized saved ratio when present, else the admin default.
function sanitizeRatios(saved) {
  const clean = {};
  if (!saved || typeof saved !== 'object') return clean;
  for (const [k, v] of Object.entries(saved)) {
    const n = Number(v);
    if (k !== 'views' && Number.isFinite(n)) clean[k] = Math.min(100, Math.max(0, n));
  }
  return clean;
}

function effectiveRatio(type, savedRatios, defaultRatios) {
  if (type === 'views') return 100;
  const userRatio = savedRatios ? savedRatios[type] : undefined;
  return typeof userRatio === 'number' ? userRatio : (defaultRatios[type] ?? 1);
}

// Quantity for a type at a given base quantity (views always equals base).
function quantityFor(type, baseQuantity, savedRatios, defaultRatios) {
  return Math.round(baseQuantity * (effectiveRatio(type, savedRatios, defaultRatios) / 100));
}

// Impression/reach-type custom services default to 500 per 1000 views (50%);
// other custom services default to 1%. Mirrors defaultCustomRatio in
// src/lib/engagement-types.ts on the VPS.
function defaultCustomRatio(type) {
  return /impression|reach/.test(type) ? 50 : 1;
}

module.exports = { sanitizeRatios, effectiveRatio, quantityFor, defaultCustomRatio };

// Saved ratios only apply when stored with the current settings version (v=3).
// Older saves (no version) are ignored so new admin defaults show up.
function loadSavedRatios(parsed) {
  if (!parsed || !parsed.ratios || parsed.v !== 3) return null;
  return sanitizeRatios(parsed.ratios);
}
module.exports.loadSavedRatios = loadSavedRatios;

// Mirrors BASE_DEFAULT_RATIOS on the VPS: exact defaults at 1000 base views.
module.exports.DEFAULT_BASE_QUANTITY = 1000;
module.exports.DEFAULT_RATIOS = { views: 100, likes: 2.5, comments: 0.1, saves: 1.2, shares: 1.3, reposts: 1.1 };

// Mirrors process-engagement-order on the VPS: the admin INR price for the
// engagement type wins over the provider price; charges keep 8 decimals so
// INR totals equal admin price x quantity / 1000 exactly (rate fixed at 90).
const INR_RATE = 90;
function storedPerK(inrPerK) { return Number((inrPerK / INR_RATE).toFixed(12)); }
function chargeInr(type, qty, adminPerKByType, providerPerK) {
  const perK = adminPerKByType[type] ?? providerPerK;
  return Math.round((qty / 1000) * perK * 1e8) / 1e8 * INR_RATE;
}
module.exports.storedPerK = storedPerK;
module.exports.chargeInr = chargeInr;
