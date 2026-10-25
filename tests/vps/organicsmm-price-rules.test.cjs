const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRatios, effectiveRatio, quantityFor } = require('./organicsmm-price-rules.cjs');

const { DEFAULT_RATIOS: DEFAULTS, DEFAULT_BASE_QUANTITY } = require('./organicsmm-price-rules.cjs');

// Regression: 10,000 views orders charged for 101 or 319,459 views because a
// saved 'views' ratio overrode the base quantity.
test('views quantity always equals base quantity, ignoring saved ratios', () => {
  assert.equal(quantityFor('views', 10000, { views: 1 }, DEFAULTS), 10000);
  assert.equal(quantityFor('views', 10000, { views: 3194 }, DEFAULTS), 10000);
  assert.equal(quantityFor('views', 10000, null, DEFAULTS), 10000);
});

test('saved views ratio is dropped during sanitization', () => {
  assert.deepEqual(sanitizeRatios({ views: 1, likes: 5 }), { likes: 5 });
});

test('ratios are clamped to 0..100 and non-finite values dropped', () => {
  assert.deepEqual(sanitizeRatios({ likes: 250, comments: -3, saves: NaN, shares: 'abc', reposts: 2 }), { likes: 100, comments: 0, reposts: 2 });
});

test('valid saved ratios still apply to non-views types', () => {
  assert.equal(quantityFor('likes', 10000, { likes: 5 }, DEFAULTS), 500);
  assert.equal(quantityFor('comments', 10000, { comments: 2 }, DEFAULTS), 200);
});

test('missing saved ratios fall back to admin defaults', () => {
  assert.equal(effectiveRatio('likes', null, DEFAULTS), 2.5);
  assert.equal(quantityFor('likes', 10000, null, DEFAULTS), 250);
});

const { defaultCustomRatio } = require('./organicsmm-price-rules.cjs');

// Rule: 1000 views -> 500 impressions by default (50%), user can still customize.
test('impression/reach custom services default to 500 per 1000 views', () => {
  assert.equal(defaultCustomRatio('custom_reach_impressions'), 50);
  assert.equal(quantityFor('custom_reach_impressions', 1000, null, { custom_reach_impressions: 50 }), 500);
});

test('other custom services keep the 1% fallback', () => {
  assert.equal(defaultCustomRatio('custom_profile_visits'), 1);
});

// Rule: first-visit defaults are Views 1000, Likes 25, Comments 1, Shares 13,
// Reposts 11, Saves 12.
test('first-visit defaults: views 1000, likes 25, comments 1, shares 13, reposts 11, saves 12', () => {
  const b = DEFAULT_BASE_QUANTITY;
  assert.equal(quantityFor('views', b, null, DEFAULTS), 1000);
  assert.equal(quantityFor('likes', b, null, DEFAULTS), 25);
  assert.equal(quantityFor('comments', b, null, DEFAULTS), 1);
  assert.equal(quantityFor('shares', b, null, DEFAULTS), 13);
  assert.equal(quantityFor('reposts', b, null, DEFAULTS), 11);
  assert.equal(quantityFor('saves', b, null, DEFAULTS), 12);
});

const { loadSavedRatios } = require('./organicsmm-price-rules.cjs');

// Regression: older saved settings (v2 / unversioned) overrode the defaults;
// only settings saved from the current Settings page (v3) apply.
test('old saved ratios are ignored, current saves are kept', () => {
  assert.equal(loadSavedRatios({ ratios: { likes: 5 } }), null);
  assert.equal(loadSavedRatios({ v: 2, ratios: { likes: 5 } }), null);
  assert.deepEqual(loadSavedRatios({ v: 3, ratios: { likes: 4 } }), { likes: 4 });
});

const { storedPerK, chargeInr } = require('./organicsmm-price-rules.cjs');
// Rule: users pay exactly the admin INR price per 1000, no dollar rounding.
test('charge equals admin INR price x quantity / 1000', () => {
  const admin = { views: storedPerK(1.94), comments: storedPerK(5000), likes: storedPerK(129.34) };
  assert.equal(chargeInr('comments', 1, admin, 0.2).toFixed(4), '5.0000');
  assert.equal(chargeInr('views', 1000, admin, 0.0022).toFixed(4), '1.9400');
  assert.equal(chargeInr('likes', 25, admin, 0.3).toFixed(4), '3.2335');
});
test('admin type price wins over cheaper provider price', () => {
  assert.equal(chargeInr('views', 1000, { views: storedPerK(1.94) }, 0.0022).toFixed(2), '1.94');
});
