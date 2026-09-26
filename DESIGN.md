# Database Design

## Goal

The database is designed to store product catalog data and scrape history without losing the truth of what actually happened during the live scraping flow.

## Schema Choice

The design follows a normalized model with the following intent:

### products
Stores the canonical catalog item.

- `store_product_id` is the external product identity used by the mock store.
- `name`, `sku`, and `product_url` capture the product metadata and canonical route.

This keeps the catalog item stable even if we later monitor multiple variants or repeated scrape cycles.

### product_options
Stores per-product variant metadata.

- `option_name` captures the variant dimension such as `Kit`.
- `option_value` captures the actual variant label such as `Standard kit`.
- `store_option_id` preserves the original store-side option identifier when available.

This is preferable to collapsing all variants into a single free-form string because option values are a real domain concept and should be queryable as data.

### tracked_products
Tracks the specific product-option pair being monitored.

A tracked product is the combination of a normalized product and a specific option. This keeps monitoring rules separate from the product catalogue itself and lets the system monitor the same product across multiple option variants without ambiguity.

### scrape_logs
Stores each scrape attempt as a distinct row.

This is the key to preserving retry semantics honestly. A failed attempt is never overwritten by a later success. Instead, the database stores:

- Attempt 1 → failed/retried
- Attempt 2 → success

This is recorded as two separate rows, each with its own `attempt_number`, `outcome`, `price`, `stock`, and timestamps.

## Why failed attempts and retries are stored separately

The scraper can legitimately retry a request after a timeout or challenge failure. If the first attempt failed and the second attempt succeeded, the database must still show both outcomes.

A single row would lose the truth of the earlier fallback path and make the retry history unreliable. Storing each attempt separately preserves operational reality and supports debugging, SLA analysis, and historical trend reporting.

## Outcome values

The database uses a controlled `scrape_outcome` enum with:

- `success`
- `retried`
- `failed`

This prevents invalid strings from being stored accidentally and makes downstream reporting predictable.

## Failure and stock handling

For a failure, the database enforces:

- `price = NULL`
- `stock = NULL`
- `outcome = 'failed'`

This clearly distinguishes a scraper failure from a real product state.

For sold-out inventory, the schema uses a separate `stock_status` value:

- `unknown`
- `missing`
- `in_stock`
- `sold_out`

When the store explicitly reports sold out, the system stores:

- `stock_status = 'sold_out'`
- `stock = 0`

This makes sold out distinct from:
- scraper failure (`NULL` price/stock)
- missing stock metadata (`NULL` with `stock_status = 'missing'`)
- unknown stock (`stock_status = 'unknown'`)

## Indexing

The migration includes the most useful indexes only:

- `products.store_product_id`
- `tracked_products.product_id + option_id`
- `scrape_logs.timestamp`
- `scrape_logs.outcome`

This supports lookups by store product identity, product tracking rows, and historical time/outcome queries without creating unnecessary indexing overhead.

## Migration location

```text
backend/src/db/migrations/001_init_schema.sql
```

This file can be applied with:

```bash
cd backend
npm run db:migrate
```

## Scope note

This step is database setup only. The scheduler, API layer, and React dashboard are intentionally not implemented here.
