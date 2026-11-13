# E-Commerce Product Multi-Filter Sidebar

A marketplace browsing interface where shoppers narrow a product inventory using three
simultaneous filters (category, price range, minimum star rating), with instant updates
and a server-side "Sort By" control.

## Quick start

Requires Node.js 18 or newer. No dependencies to install.

```bash
npm test     # run unit tests
npm start    # http://localhost:3000
```

## Architecture

```
server.js                      HTTP server + routes (Node built-in http module)
src/data/products.js           Master inventory (160 generated products, 4 categories)
src/services/filterService.js  Validation, filtering, sorting (all business logic)
src/services/imageService.js   SVG thumbnails generated per product
public/                        Presentation only: sidebar, grid, sort, empty state
test/filterService.test.js     Unit tests for the business logic
```

### Request pipeline

Every filter change calls `GET /api/products` with the current state. The server:

1. **Parses and validates** the query (`parseFilterQuery`). Unknown categories, non-numeric
   prices, ratings outside 0 to 5, an inverted price range, or an unknown sort key return `400`.
2. **Filters first** (`applyFilters`). A single pass over the master array keeps a product only
   if it is in a selected category, its price is inside the bounds (inclusive), and its rating
   is at or above the minimum (inclusive). Criteria combine with AND.
3. **Sorts the survivors.** Sorting runs on the filtered copy, so the master array is never
   mutated and ties are broken deterministically by price, then id.

### Null handling

Each criterion is `null` when unset. Empty categories, unset price bounds, and "Any rating"
(0) are all skipped. With every filter cleared, the full base inventory is returned unchanged.

### Empty state

When the filtered result is empty, the grid is hidden and the screen shows
"No items match your criteria." with a **Reset filters** button.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/meta` | Categories, price bounds, sort options, total count |
| GET | `/api/products` | Filtered and sorted products |
| GET | `/img/:id.svg` | Product thumbnail |

`/api/products` query parameters (all optional):

| Param | Example | Meaning |
| --- | --- | --- |
| `categories` | `Electronics,Apparel` | Comma-separated category names (OR within the group) |
| `minPrice` | `500` | Inclusive lower price bound |
| `maxPrice` | `5000` | Inclusive upper price bound |
| `minRating` | `4` | Minimum rating, 0 to 5 (0 = any) |
| `sort` | `price-asc` | `featured`, `price-asc`, or `rating-desc` |

Example:

```bash
curl "http://localhost:3000/api/products?categories=Footwear&minRating=4&sort=price-asc"
```

## Design decisions

- **Server owns the rules.** Price boundary checks, rating comparisons, and sorting all live in
  `filterService.js`. The browser sends state and renders what comes back, so a different client
  would get identical results.
- **No external dependencies.** The project uses Node's built-in `http`, `fs`, and `node:test`,
  so it runs offline and can be reviewed without an install step.
- **Debounced sliders only.** Checkboxes, radios, and the sort dropdown fire immediately. The
  price sliders wait 120 ms after the last movement to avoid flooding the API while dragging.
- **Stale-response protection.** Each new request aborts the previous one, so a slow earlier
  response cannot overwrite a newer result.
- **Price handles cannot cross.** Moving the minimum above the maximum pushes the other handle along.

## Assumptions

- Prices are in Indian Rupees (₹), formatted for en-IN.
- Ratings run from 0 to 5 in tenths. Star display rounds to whole stars.
- The catalog is generated from a fixed seed, so the same products appear on every run.
- "Any rating" is the default radio option, meaning no star constraint.
