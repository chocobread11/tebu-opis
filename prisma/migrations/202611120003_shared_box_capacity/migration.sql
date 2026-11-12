BEGIN;
ALTER TABLE schedules ALTER COLUMN capacity SET DEFAULT 12;
ALTER TABLE schedules ALTER COLUMN kecik_capacity SET DEFAULT 12;
ALTER TABLE schedules ALTER COLUMN besar_capacity SET DEFAULT 6;

-- Upgrade standard days; preserve custom capacities and all existing reservations.
UPDATE schedules s SET capacity = GREATEST(
  CASE WHEN s.capacity = 11 THEN 12 ELSE s.capacity END,
  (SELECT COALESCE(SUM(CASE i.product_id WHEN 'kecik' THEN i.quantity WHEN 'besar' THEN 2 * i.quantity ELSE 0 END), 0)::integer
   FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.schedule_id = s.id AND o.status <> 'rejected'
   AND (o.status <> 'pending_payment' OR o.expires_at > now()))
);
-- These columns remain for compatibility, but never limit bottle sizes independently.
UPDATE schedules SET kecik_capacity = capacity, besar_capacity = capacity / 2;
COMMIT;
