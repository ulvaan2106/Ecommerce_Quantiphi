'use strict';

const { CATEGORY_COLORS } = require('../data/products');

const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch]);
}

/** Generates a lightweight SVG thumbnail so the project has no external image dependencies. */
function renderProductImage(product) {
  const color = CATEGORY_COLORS[product.category] || '#64748b';
  const initial = escapeXml(product.name.charAt(0));
  const label = escapeXml(product.category);
  const name = escapeXml(product.name);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-label="${name}">
  <rect width="320" height="240" fill="${color}" fill-opacity="0.12"/>
  <circle cx="160" cy="105" r="62" fill="${color}"/>
  <text x="160" y="120" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#ffffff" text-anchor="middle">${initial}</text>
  <text x="160" y="212" font-family="Arial, sans-serif" font-size="16" fill="#334155" text-anchor="middle">${label}</text>
</svg>`;
}

module.exports = { renderProductImage };
