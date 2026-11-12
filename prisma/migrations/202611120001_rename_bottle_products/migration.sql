BEGIN;

-- Updating the primary keys also updates order_items through ON UPDATE CASCADE.
ALTER TABLE products DROP CONSTRAINT product_id;
UPDATE products SET id = 'kecik', name = 'Botol Kecik', size = '500ml', description = 'Kecik muat beg.' WHERE id = 'flask';
UPDATE products SET id = 'besar', name = 'Botol Besar', size = '1l', description = 'Bawak balik rumah.' WHERE id = 'jug';
ALTER TABLE products ADD CONSTRAINT product_id CHECK (id IN ('kecik', 'besar', 'asam', 'limau'));

-- Preserve quantities, add-ons, totals, and the rest of each order snapshot.
UPDATE orders SET cart = (cart - 'flask' - 'jug') || jsonb_build_object(
  'kecik', COALESCE(cart->'flask', cart->'kecik', '0'::jsonb),
  'besar', COALESCE(cart->'jug', cart->'besar', '0'::jsonb)
);

ALTER TABLE schedules RENAME COLUMN flask_capacity TO kecik_capacity;
ALTER TABLE schedules RENAME COLUMN jug_capacity TO besar_capacity;
ALTER TABLE schedules RENAME CONSTRAINT schedules_flask_capacity_check TO schedules_kecik_capacity_check;
ALTER TABLE schedules RENAME CONSTRAINT schedules_jug_capacity_check TO schedules_besar_capacity_check;
ALTER TABLE harvests RENAME COLUMN flask_qty TO kecik_qty;
ALTER TABLE harvests RENAME COLUMN jug_qty TO besar_qty;
ALTER TABLE harvests RENAME CONSTRAINT harvest_flask_nonnegative TO harvest_kecik_nonnegative;
ALTER TABLE harvests RENAME CONSTRAINT harvest_jug_nonnegative TO harvest_besar_nonnegative;

COMMIT;
