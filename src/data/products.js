'use strict';

/**
 * Master product inventory.
 * In production this would come from a database. Here it is generated
 * deterministically so every run produces the same catalog.
 */

const CATEGORY_CONFIG = {
  Electronics: {
    color: '#2563eb',
    priceRange: [999, 79999],
    nouns: ['Headphones', 'Smartwatch', 'Bluetooth Speaker', 'Tablet', 'Power Bank', 'Webcam', 'Keyboard', 'Earbuds'],
  },
  Apparel: {
    color: '#16a34a',
    priceRange: [299, 6999],
    nouns: ['Hoodie', 'Denim Jacket', 'Cotton Tee', 'Linen Shirt', 'Track Pants', 'Raincoat', 'Sweater'],
  },
  Footwear: {
    color: '#ea580c',
    priceRange: [499, 12999],
    nouns: ['Running Shoes', 'Sneakers', 'Loafers', 'Sandals', 'Trail Boots', 'Slip-ons'],
  },
  'Home & Kitchen': {
    color: '#9333ea',
    priceRange: [199, 15999],
    nouns: ['Cookware Set', 'Coffee Grinder', 'Air Fryer', 'Desk Lamp', 'Storage Box', 'Water Bottle'],
  },
};

const BRANDS = ['Nova', 'Arbor', 'Kestrel', 'Lumen', 'Vertex', 'Pine & Co', 'Orbit', 'Zephyr'];
const VARIANTS = ['Pro', 'Lite', 'Max', 'Classic', 'Plus', 'Air'];
const PRODUCTS_PER_CATEGORY = 40;
const SEED = 20261113;

/** Small seeded PRNG (LCG) so the generated catalog is reproducible. */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildCatalog() {
  const rng = createRng(SEED);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const products = [];
  let nextId = 1;

  for (const [category, cfg] of Object.entries(CATEGORY_CONFIG)) {
    const [low, high] = cfg.priceRange;
    for (let i = 0; i < PRODUCTS_PER_CATEGORY; i++) {
      // Prices end in 9 (e.g. 1499, 2999) to look like real retail prices.
      const price = Math.max(low, Math.round((low + rng() * (high - low)) / 10) * 10 - 1);
      const rating = Math.round((2.5 + rng() * 2.5) * 10) / 10; // 2.5 to 5.0
      products.push({
        id: nextId++,
        name: `${pick(BRANDS)} ${pick(cfg.nouns)} ${pick(VARIANTS)}`,
        category,
        price,
        rating,
      });
    }
  }

  // Fisher–Yates shuffle so the grid is not grouped by category.
  for (let i = products.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [products[i], products[j]] = [products[j], products[i]];
  }

  return products.map((product) => Object.freeze(product));
}

const PRODUCTS = Object.freeze(buildCatalog());
const CATEGORIES = Object.freeze(Object.keys(CATEGORY_CONFIG));
const CATEGORY_COLORS = Object.freeze(
  Object.fromEntries(Object.entries(CATEGORY_CONFIG).map(([name, cfg]) => [name, cfg.color]))
);

const allPrices = PRODUCTS.map((p) => p.price);
const PRICE_BOUNDS = Object.freeze({
  min: Math.min(...allPrices),
  max: Math.max(...allPrices),
});

const PRODUCT_INDEX = new Map(PRODUCTS.map((p) => [p.id, p]));

function findProductById(id) {
  return PRODUCT_INDEX.get(id) || null;
}

module.exports = {
  PRODUCTS,
  CATEGORIES,
  CATEGORY_COLORS,
  PRICE_BOUNDS,
  findProductById,
};
