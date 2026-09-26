DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'scrape_outcome'
  ) THEN
    CREATE TYPE scrape_outcome AS ENUM ('success', 'retried', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'stock_status'
  ) THEN
    CREATE TYPE stock_status AS ENUM ('unknown', 'missing', 'in_stock', 'sold_out');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  store_product_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sku TEXT,
  product_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_options (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  store_option_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, option_name, option_value)
);

CREATE TABLE IF NOT EXISTS tracked_products (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, option_id)
);

CREATE TABLE IF NOT EXISTS scrape_logs (
  id BIGSERIAL PRIMARY KEY,
  tracked_product_id BIGINT NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  outcome scrape_outcome NOT NULL,
  price NUMERIC(12, 2),
  stock INTEGER,
  stock_status stock_status NOT NULL DEFAULT 'unknown',
  error_message TEXT,
  duration_ms INTEGER CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (price IS NULL OR price >= 0),
  CHECK (stock IS NULL OR stock >= 0),
  CHECK (
    (outcome = 'failed' AND price IS NULL AND stock IS NULL AND stock_status IN ('unknown', 'missing'))
    OR
    (outcome IN ('success', 'retried') AND stock_status IN ('unknown', 'missing', 'in_stock', 'sold_out'))
  )
);

CREATE INDEX IF NOT EXISTS idx_products_store_product_id ON products (store_product_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_tracked_product ON tracked_products (product_id, option_id);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_timestamp ON scrape_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_outcome ON scrape_logs (outcome);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_tracked_product_timestamp ON scrape_logs (tracked_product_id, timestamp);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_products_updated_at'
  ) THEN
    CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_tracked_products_updated_at'
  ) THEN
    CREATE TRIGGER trg_tracked_products_updated_at
    BEFORE UPDATE ON tracked_products
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;
