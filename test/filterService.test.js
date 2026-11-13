'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFilters, parseFilterQuery } = require('../src/services/filterService');
const { PRODUCTS, CATEGORIES, PRICE_BOUNDS } = require('../src/data/products');

const SAMPLE = [
  { id: 1, name: 'A', category: 'Electronics', price: 1000, rating: 4.5 },
  { id: 2, name: 'B', category: 'Apparel', price: 500, rating: 3.0 },
  { id: 3, name: 'C', category: 'Electronics', price: 2000, rating: 2.0 },
  { id: 4, name: 'D', category: 'Footwear', price: 1500, rating: 5.0 },
  { id: 5, name: 'E', category: 'Apparel', price: 1000, rating: 4.0 },
];

const NONE = { categories: [], minPrice: null, maxPrice: null, minRating: null };
const ids = (list) => list.map((p) => p.id);

test('empty criteria bypasses all filters and returns the full inventory', () => {
  assert.deepEqual(ids(applyFilters(SAMPLE, NONE)), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(applyFilters(SAMPLE, {})), [1, 2, 3, 4, 5]);
});

test('category filter keeps only selected categories', () => {
  const result = applyFilters(SAMPLE, { ...NONE, categories: ['Electronics'] });
  assert.deepEqual(ids(result), [1, 3]);
});

test('price bounds are inclusive on both ends', () => {
  const result = applyFilters(SAMPLE, { ...NONE, minPrice: 1000, maxPrice: 1500 });
  assert.deepEqual(ids(result), [1, 4, 5]);
});

test('minimum rating is inclusive (meets or exceeds)', () => {
  const result = applyFilters(SAMPLE, { ...NONE, minRating: 4 });
  assert.deepEqual(ids(result), [1, 4, 5]);
});

test('all criteria combine with AND logic', () => {
  const result = applyFilters(SAMPLE, {
    categories: ['Electronics', 'Apparel'],
    minPrice: 1000,
    maxPrice: null,
    minRating: 4,
  });
  assert.deepEqual(ids(result), [1, 5]);
});

test('returns an empty array when nothing matches', () => {
  const result = applyFilters(SAMPLE, { ...NONE, categories: ['Footwear'], minRating: 4.9, maxPrice: 100 });
  assert.deepEqual(result, []);
});

test('price ascending sort orders filtered results, ties broken by id', () => {
  assert.deepEqual(ids(applyFilters(SAMPLE, NONE, 'price-asc')), [2, 1, 5, 4, 3]);
});

test('top rated sort orders by rating descending', () => {
  assert.deepEqual(ids(applyFilters(SAMPLE, NONE, 'rating-desc')), [4, 1, 5, 2, 3]);
});

test('filtering then sorting only arranges the surviving products', () => {
  const result = applyFilters(SAMPLE, { ...NONE, categories: ['Apparel'] }, 'rating-desc');
  assert.deepEqual(ids(result), [5, 2]);
});

test('does not mutate the master inventory', () => {
  const before = ids(SAMPLE);
  applyFilters(SAMPLE, NONE, 'price-asc');
  applyFilters(SAMPLE, NONE, 'rating-desc');
  assert.deepEqual(ids(SAMPLE), before);
});

test('parseFilterQuery builds criteria from a full query string', () => {
  const params = new URLSearchParams(
    'categories=Electronics,Apparel&minPrice=100&maxPrice=5000&minRating=3&sort=price-asc'
  );
  const parsed = parseFilterQuery(params);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.criteria, {
    categories: ['Electronics', 'Apparel'],
    minPrice: 100,
    maxPrice: 5000,
    minRating: 3,
  });
  assert.equal(parsed.sort, 'price-asc');
});

test('parseFilterQuery treats rating 0 as "Any" (no constraint)', () => {
  const parsed = parseFilterQuery(new URLSearchParams('minRating=0'));
  assert.equal(parsed.criteria.minRating, null);
});

test('parseFilterQuery rejects unknown categories, bad numbers, inverted ranges and unknown sorts', () => {
  assert.equal(parseFilterQuery(new URLSearchParams('categories=Toys')).ok, false);
  assert.equal(parseFilterQuery(new URLSearchParams('minRating=6')).ok, false);
  assert.equal(parseFilterQuery(new URLSearchParams('minPrice=abc')).ok, false);
  assert.equal(parseFilterQuery(new URLSearchParams('minPrice=900&maxPrice=100')).ok, false);
  assert.equal(parseFilterQuery(new URLSearchParams('sort=random')).ok, false);
});

test('empty query parses to no-op criteria', () => {
  const parsed = parseFilterQuery(new URLSearchParams(''));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.criteria, NONE);
  assert.equal(parsed.sort, 'featured');
});

test('generated catalog is well-formed', () => {
  assert.equal(PRODUCTS.length, CATEGORIES.length * 40);
  for (const p of PRODUCTS) {
    assert.ok(p.price > 0);
    assert.ok(p.rating >= 0 && p.rating <= 5);
    assert.ok(CATEGORIES.includes(p.category));
  }
  assert.ok(PRICE_BOUNDS.min <= PRICE_BOUNDS.max);
});
