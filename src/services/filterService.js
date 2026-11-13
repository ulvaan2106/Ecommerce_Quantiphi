'use strict';

/**
 * Core business logic for browsing the catalog.
 *
 * Pipeline (per request):
 *   1. parseFilterQuery  - validate raw query params into a criteria object
 *   2. applyFilters      - single pass over the master inventory keeping only
 *                          products that satisfy ALL active criteria (AND logic)
 *   3. sort              - arrange the surviving products; sorting is applied
 *                          to the filtered copy, never to the master array
 */

const { CATEGORIES } = require('../data/products');

const MAX_PRICE = Number.MAX_SAFE_INTEGER;

const SORT_OPTIONS = [
  { key: 'featured', label: 'Featured', compare: null },
  {
    key: 'price-asc',
    label: 'Price: Low to High',
    compare: (a, b) => a.price - b.price || a.id - b.id,
  },
  {
    key: 'rating-desc',
    label: 'Top Rated First',
    compare: (a, b) => b.rating - a.rating || a.price - b.price || a.id - b.id,
  },
];

const SORT_COMPARATORS = new Map(SORT_OPTIONS.map((opt) => [opt.key, opt.compare]));
const PUBLIC_SORT_OPTIONS = SORT_OPTIONS.map(({ key, label }) => ({ key, label }));

/** Parses one numeric query param. Empty/missing means "no constraint" (null). */
function readNumber(raw, min, max) {
  if (raw === null || raw.trim() === '') return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { error: 'out of range or not a number' };
  }
  return { value };
}

function fail(error) {
  return { ok: false, error };
}

/**
 * Converts URLSearchParams into a validated criteria object.
 * Returns { ok: true, criteria, sort } or { ok: false, error }.
 */
function parseFilterQuery(params) {
  const categories = [];
  const rawCategories = params.get('categories');
  if (rawCategories) {
    const requested = [...new Set(rawCategories.split(',').map((s) => s.trim()).filter(Boolean))];
    const unknown = requested.filter((c) => !CATEGORIES.includes(c));
    if (unknown.length > 0) return fail(`Unknown categories: ${unknown.join(', ')}`);
    categories.push(...requested);
  }

  const minPrice = readNumber(params.get('minPrice'), 0, MAX_PRICE);
  const maxPrice = readNumber(params.get('maxPrice'), 0, MAX_PRICE);
  const minRating = readNumber(params.get('minRating'), 0, 5);

  for (const [name, parsed] of Object.entries({ minPrice, maxPrice, minRating })) {
    if (parsed.error) return fail(`Invalid ${name}: ${parsed.error}`);
  }

  if (minPrice.value !== null && maxPrice.value !== null && minPrice.value > maxPrice.value) {
    return fail('minPrice cannot be greater than maxPrice');
  }

  const sort = params.get('sort') || 'featured';
  if (!SORT_COMPARATORS.has(sort)) return fail(`Unknown sort: ${sort}`);

  return {
    ok: true,
    criteria: {
      categories,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      // 0 means "Any rating", so it is the same as no rating constraint.
      minRating: minRating.value > 0 ? minRating.value : null,
    },
    sort,
  };
}

/**
 * Filters the master inventory, then sorts the survivors.
 * The input array is never mutated.
 *
 * Null handling: any criterion that is null/empty is skipped, so an empty
 * criteria object returns the full base inventory.
 */
function applyFilters(products, criteria = {}, sortKey = 'featured') {
  const { categories = [], minPrice = null, maxPrice = null, minRating = null } = criteria;
  const categorySet = categories.length > 0 ? new Set(categories) : null;

  const matches = [];
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (categorySet && !categorySet.has(product.category)) continue;
    if (minPrice != null && product.price < minPrice) continue;
    if (maxPrice != null && product.price > maxPrice) continue;
    if (minRating != null && product.rating < minRating) continue;
    matches.push(product);
  }

  const compare = SORT_COMPARATORS.get(sortKey);
  if (compare) matches.sort(compare);

  return matches;
}

/** Shape sent to the browser. Adds the thumbnail URL. */
function toPublicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    rating: product.rating,
    image: `/img/${product.id}.svg`,
  };
}

module.exports = {
  SORT_OPTIONS: PUBLIC_SORT_OPTIONS,
  parseFilterQuery,
  applyFilters,
  toPublicProduct,
};
