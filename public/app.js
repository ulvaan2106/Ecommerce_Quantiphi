(() => {
  'use strict';

  /*
   * Presentation layer only. Every filter rule, price bound check, rating
   * comparison and sort happens on the server (see src/services/filterService.js).
   * This file gathers the sidebar state, asks the API for matching products,
   * and renders the response.
   */

  const $ = (id) => document.getElementById(id);
  const els = {
    total: $('total'),
    categoryList: $('categoryList'),
    ratingList: $('ratingList'),
    priceMin: $('priceMin'),
    priceMax: $('priceMax'),
    rangeFill: $('rangeFill'),
    priceMinLabel: $('priceMinLabel'),
    priceMaxLabel: $('priceMaxLabel'),
    resetBtn: $('resetBtn'),
    emptyResetBtn: $('emptyResetBtn'),
    sortSelect: $('sortSelect'),
    resultCount: $('resultCount'),
    errorBox: $('errorBox'),
    grid: $('grid'),
    emptyState: $('emptyState'),
  };

  const money = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

  // null means "no constraint" and is never sent to the server.
  const state = {
    categories: new Set(),
    minPrice: null,
    maxPrice: null,
    minRating: null,
    sort: 'featured',
  };

  let bounds = { min: 0, max: 0 };
  let controller = null;
  let sliderTimer = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function fetchJson(url, signal) {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.categories.size > 0) params.set('categories', [...state.categories].join(','));
    if (state.minPrice !== null) params.set('minPrice', String(state.minPrice));
    if (state.maxPrice !== null) params.set('maxPrice', String(state.maxPrice));
    if (state.minRating !== null) params.set('minRating', String(state.minRating));
    params.set('sort', state.sort);
    return params.toString();
  }

  /* ---------- Sidebar construction ---------- */

  function renderCategories(categories) {
    for (const name of categories) {
      const input = el('input');
      input.type = 'checkbox';
      input.value = name;
      input.addEventListener('change', () => {
        if (input.checked) state.categories.add(name);
        else state.categories.delete(name);
        loadProducts();
      });

      const label = el('label');
      label.append(input, document.createTextNode(name));
      els.categoryList.append(label);
    }
  }

  function renderRatings() {
    const options = [{ value: 0, label: 'Any rating' }];
    for (let n = 1; n <= 5; n++) {
      options.push({ value: n, label: `${'★'.repeat(n)} & up` });
    }

    for (const opt of options) {
      const input = el('input');
      input.type = 'radio';
      input.name = 'minRating';
      input.value = String(opt.value);
      input.checked = opt.value === 0;
      input.addEventListener('change', () => {
        state.minRating = opt.value > 0 ? opt.value : null;
        loadProducts();
      });

      const label = el('label');
      label.append(input, document.createTextNode(opt.label));
      els.ratingList.append(label);
    }
  }

  function renderSortOptions(sortOptions) {
    for (const opt of sortOptions) {
      els.sortSelect.append(new Option(opt.label, opt.key));
    }
    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      loadProducts();
    });
  }

  /* ---------- Price slider ---------- */

  function setupPriceSlider() {
    for (const input of [els.priceMin, els.priceMax]) {
      input.min = String(bounds.min);
      input.max = String(bounds.max);
      input.step = '1';
    }
    els.priceMin.value = String(bounds.min);
    els.priceMax.value = String(bounds.max);
    updatePriceVisuals();

    els.priceMin.addEventListener('input', () => onPriceInput('min'));
    els.priceMax.addEventListener('input', () => onPriceInput('max'));
  }

  function updatePriceVisuals() {
    const lo = Number(els.priceMin.value);
    const hi = Number(els.priceMax.value);
    const span = bounds.max - bounds.min || 1;
    const left = ((lo - bounds.min) / span) * 100;
    const right = ((hi - bounds.min) / span) * 100;

    els.rangeFill.style.left = `${left}%`;
    els.rangeFill.style.width = `${right - left}%`;
    els.priceMinLabel.textContent = money.format(lo);
    els.priceMaxLabel.textContent = money.format(hi);
  }

  function onPriceInput(changed) {
    let lo = Number(els.priceMin.value);
    let hi = Number(els.priceMax.value);

    // Keep the handles from crossing.
    if (lo > hi) {
      if (changed === 'min') {
        lo = hi;
        els.priceMin.value = String(lo);
      } else {
        hi = lo;
        els.priceMax.value = String(hi);
      }
    }

    // Sitting at the full range means "no price constraint".
    state.minPrice = lo <= bounds.min ? null : lo;
    state.maxPrice = hi >= bounds.max ? null : hi;

    updatePriceVisuals();
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(loadProducts, 120);
  }

  /* ---------- Data loading and rendering ---------- */

  async function loadProducts() {
    if (controller) controller.abort();
    controller = new AbortController();

    try {
      const data = await fetchJson(`/api/products?${buildQuery()}`, controller.signal);
      hideError();
      renderResults(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      showError(err.message);
    }
  }

  function renderResults({ count, total, items }) {
    els.resultCount.textContent = `Showing ${count} of ${total} products`;

    if (count === 0) {
      els.grid.hidden = true;
      els.grid.replaceChildren();
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    els.grid.hidden = false;
    els.grid.replaceChildren(...items.map(createCard));
  }

  function createCard(product) {
    const card = el('article', 'card');

    const img = el('img', 'card-img');
    img.src = product.image;
    img.alt = product.name;
    img.loading = 'lazy';

    const body = el('div', 'card-body');
    body.append(
      el('span', 'card-category', product.category),
      el('h3', 'card-title', product.name),
      createStars(product.rating),
      el('p', 'card-price', money.format(product.price))
    );

    card.append(img, body);
    return card;
  }

  function createStars(rating) {
    const wrap = el('div', 'stars');
    wrap.setAttribute('aria-label', `Rated ${rating.toFixed(1)} out of 5`);

    const filled = Math.round(rating);
    for (let i = 1; i <= 5; i++) {
      wrap.append(el('span', i <= filled ? 'star on' : 'star', '★'));
    }
    wrap.append(el('span', 'rating-num', rating.toFixed(1)));
    return wrap;
  }

  function showError(message) {
    els.errorBox.textContent = message;
    els.errorBox.hidden = false;
  }

  function hideError() {
    els.errorBox.hidden = true;
  }

  /* ---------- Reset ---------- */

  function resetFilters() {
    state.categories.clear();
    state.minPrice = null;
    state.maxPrice = null;
    state.minRating = null;

    els.categoryList.querySelectorAll('input').forEach((input) => { input.checked = false; });
    els.ratingList.querySelector('input[value="0"]').checked = true;

    els.priceMin.value = String(bounds.min);
    els.priceMax.value = String(bounds.max);
    updatePriceVisuals();

    loadProducts();
  }

  /* ---------- Boot ---------- */

  async function init() {
    try {
      const meta = await fetchJson('/api/meta');
      bounds = meta.priceBounds;
      els.total.textContent = `${meta.total} products`;

      renderCategories(meta.categories);
      renderRatings();
      renderSortOptions(meta.sortOptions);
      setupPriceSlider();

      els.resetBtn.addEventListener('click', resetFilters);
      els.emptyResetBtn.addEventListener('click', resetFilters);

      await loadProducts();
    } catch (err) {
      showError(`Could not load the catalog: ${err.message}`);
    }
  }

  init();
})();
