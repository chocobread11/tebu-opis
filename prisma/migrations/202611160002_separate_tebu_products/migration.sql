BEGIN;
-- Keep the old tables and order snapshots for history, but inventory now belongs
-- to an individual sellable product. Each old variety/size gets its own product.
ALTER TABLE stock_entries ADD COLUMN source_harvest_id UUID REFERENCES harvests(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX stock_entries_source_harvest_id_product_id_key ON stock_entries(source_harvest_id, product_id);
CREATE TEMP TABLE split_products ON COMMIT DROP AS
SELECT p.id AS old_id, v.id AS variety_id,
       CASE WHEN v.id='tebu-1' THEN p.id ELSE v.id || '-' || p.id END AS new_id,
       v.name AS variety_name, p.name AS old_name
FROM products p CROSS JOIN cane_varieties v WHERE p.variety_tracked;

INSERT INTO products(id,name,size,description,kind,price,active,sort_order,space_cost,track_stock,variety_tracked,image_id)
SELECT m.new_id, m.variety_name || ' · ' || CASE WHEN p.name='Botol Kecik' THEN 'Kecik' WHEN p.name='Botol Besar' THEN 'Besar' ELSE p.name END, p.size,p.description,p.kind,p.price,p.active,
       p.sort_order + v.sort_order * 2,p.space_cost,p.track_stock,false,p.image_id
FROM split_products m JOIN products p ON p.id=m.old_id JOIN cane_varieties v ON v.id=m.variety_id
WHERE m.new_id<>m.old_id;

-- A historical snapshot keeps its original price, size and box-space cost.
UPDATE order_items i SET product_id=m.new_id, name=COALESCE(o.variety_name,m.variety_name) || ' · ' || COALESCE(i.name,m.old_name)
FROM orders o, split_products m
WHERE i.order_id=o.id AND i.product_id=m.old_id AND m.variety_id=COALESCE(o.variety_id,'tebu-1');
UPDATE orders o SET cart=(
 SELECT jsonb_object_agg(mapped_id,qty) FROM (
  SELECT COALESCE(m.new_id,e.key) AS mapped_id, SUM(e.value::text::integer) AS qty
  FROM jsonb_each(o.cart) e LEFT JOIN split_products m ON m.old_id=e.key AND m.variety_id=COALESCE(o.variety_id,'tebu-1')
  GROUP BY COALESCE(m.new_id,e.key)
 ) lines
) WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(o.cart) k JOIN split_products m ON m.old_id=k);
UPDATE stock_entries s SET product_id=m.new_id,variety_id=NULL
FROM split_products m WHERE s.product_id=m.old_id AND m.variety_id=COALESCE(s.variety_id,'tebu-1');

-- Copy ready bottles once into the restock ledger. The source records remain
-- readable, and their imported quantities cannot be edited as ordinary restocks.
INSERT INTO stock_entries(product_id,date,quantity,note,created_at,source_harvest_id)
SELECT m.new_id,h.date,CASE WHEN m.old_id='kecik' THEN h.kecik_qty ELSE h.besar_qty END,
       'Earlier harvest · ' || h.type || CASE WHEN h.quantity>0 THEN ' · ' || h.quantity || ' kg cane' ELSE '' END,
       h.created_at,h.id
FROM harvests h JOIN split_products m ON m.variety_id=h.variety_id AND m.old_id IN ('kecik','besar')
WHERE CASE WHEN m.old_id='kecik' THEN h.kecik_qty ELSE h.besar_qty END > 0;
UPDATE products p SET name=m.variety_name || ' · ' || CASE WHEN p.name='Botol Kecik' THEN 'Kecik' WHEN p.name='Botol Besar' THEN 'Besar' ELSE p.name END,variety_tracked=false
FROM split_products m WHERE p.id=m.old_id AND m.new_id=m.old_id;
UPDATE products SET variety_tracked=false WHERE variety_tracked;
-- Variety now lives in the line's product name, including historical snapshots.
UPDATE orders SET variety_id=NULL,variety_name=NULL;
COMMIT;
