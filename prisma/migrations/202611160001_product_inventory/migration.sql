BEGIN;
ALTER TABLE products DROP CONSTRAINT product_id;
ALTER TABLE products ADD COLUMN space_cost INTEGER NOT NULL DEFAULT 1 CHECK (space_cost BETWEEN 0 AND 4);
ALTER TABLE products ADD COLUMN track_stock BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN variety_tracked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN image_id UUID REFERENCES media(id) ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE products SET space_cost = CASE WHEN id='besar' THEN 2 WHEN kind='addon' THEN 0 ELSE 1 END,
  track_stock = kind='bottle', variety_tracked = id IN ('kecik','besar');
ALTER TABLE media ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE order_items ADD COLUMN name TEXT;
ALTER TABLE order_items ADD COLUMN size TEXT;
ALTER TABLE order_items ADD COLUMN kind TEXT;
ALTER TABLE order_items ADD COLUMN space_cost INTEGER NOT NULL DEFAULT 0 CHECK (space_cost >= 0);
UPDATE order_items i SET name=p.name,size=p.size,kind=p.kind,space_cost=p.space_cost FROM products p WHERE p.id=i.product_id;
CREATE TABLE stock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  variety_id TEXT REFERENCES cane_varieties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  date DATE NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX stock_entries_product_id_variety_id_idx ON stock_entries(product_id,variety_id);
COMMIT;
