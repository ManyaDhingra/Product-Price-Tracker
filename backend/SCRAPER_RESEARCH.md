# Mock Store Scraping Research

## Store URL
https://demo.inelabteamdev.com/

## Product URL Structure
Product listing pages are standard catalog pages. Individual product pages are routed as `/item/:id`, for example:
- https://demo.inelabteamdev.com/item/2568

The numeric `id` appears to be the canonical product identifier.

## Product ID
The product detail API returns a numeric `id` field and also a SKU string, for example:
- `id`: 2568
- `sku`: `SK-2568-JU`

The home page also shows the SKU text next to the brand name on each product card. The product ID is not only a slug; it is a numeric identifier used in the route and item payload.

## Product Name
The product name is available in the detail page markup and in the API response:
- `name`: `Junova Gimbal Nano`

It is rendered in the page heading (`h1`) and the API response includes the same value.

## Product Options
The detail page exposes a variant axis named `optionAxis`:
- `optionAxis`: `Kit`

Available options are exposed as a list, for example:
- `Body only`
- `Standard kit`
- `Creator kit`

These are represented as button controls with `aria-pressed` state in the client UI. The item API returns option objects with IDs like `o1`, `o2`, and `o3` and labels.

## Price
The base item API does not include the live selling price. The page initially shows a placeholder:
- `Price locked`
- `Hover over the price area to load the current price.`

The live price is only loaded after the page detects hover/mouse movement and the user clicks the `Check today’s price` button. The app then renders a live price such as:
- `₹3,88,438`
- `₹1,94,219`
- `46% saving`

This confirms price is not reliably available in the initial HTML or static item payload.

## Stock
The initial item payload does not include live stock data. The stock field is loaded only as part of the live price/availability flow, after the page triggers the price check. The rendered UI showed values such as:
- `Stock: 168 remaining`

The UI also supports a sold-out state (`Sold out`) when the stock is zero.

## Dynamic Content
The page is client-rendered and uses a dynamic price/availability flow. The product metadata is present immediately, but the price and stock content are deliberately hidden until a user interaction pattern is satisfied.

Observed behavior:
- Initial render: placeholder price and disabled action button
- User hovers over the price area: a client-side interaction is tracked
- User clicks `Check today’s price`: the app loads live price and stock
- Option selection changes the active variant state and the app updates the live offer data

## Network/API Findings
The live storefront makes multiple relevant requests:
- `GET /api/v2/items/2568` returns the core product metadata (id, name, SKU, specs, reviews, options)
- `GET /api/v2/handshake` returns a challenge payload including `salt`, `ts`, `difficulty`, `csig`, and `wasm`
- A later POST/GET sequence is used to resolve the live price and stock for the selected option

This shows that the browser receives product metadata from a normal API, but the current price and stock are not part of the base product JSON and instead come from a later runtime challenge/price flow.

## Reliability Observations
Observed behaviors from the live store include:
- a consent dialog appears before the app fully exposes the interactive price area
- price is intentionally locked until hover/mouse activity occurs
- the UI exposes `Loading current price…` and retry states during the dynamic fetch flow
- the request flow intentionally includes challenge-handshake logic and retries
- values are dynamic and can change with the selected option and time

This is not a simple static HTML storefront; it is intentionally designed to hide the current price/stock behind a runtime loading flow.

## HTTP vs Playwright Decision
A normal HTTP fetch can reliably retrieve the product metadata from `/api/v2/items/:id` and the challenge payload from `/api/v2/handshake`.

However, the current live price and stock are not present in the initial HTML and are not reliably available without triggering the client-side interaction flow. Because the app intentionally gates the price behind hover/gesture logic and a challenge sequence, a browser environment is materially more reliable for live price/stock extraction.

## Recommended Scraping Strategy
Use HTTP fetch for the product metadata and option structure, but plan to use Playwright only for the final live price/stock phase when the site requires browser interaction and the challenge flow.

Recommended approach:
1. Fetch the product list and item metadata via normal HTTP requests.
2. Build the product and variant model from the base item payload.
3. Use Playwright only when the scraper needs the current price and stock for a selected option, because that information is intentionally loaded later and is not reliably present in static HTML.
