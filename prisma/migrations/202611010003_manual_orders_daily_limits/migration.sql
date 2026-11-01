ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE schedules ADD COLUMN flask_capacity integer NOT NULL DEFAULT 8 CHECK (flask_capacity >= 0), ADD COLUMN jug_capacity integer NOT NULL DEFAULT 3 CHECK (jug_capacity >= 0);
ALTER TABLE schedules ALTER COLUMN capacity SET DEFAULT 11;
-- Keep enough room for existing reservations while applying the standard to future days.
UPDATE schedules s SET capacity = GREATEST(11, (SELECT COALESCE(SUM(bottles), 0) FROM orders o WHERE o.schedule_id = s.id AND o.status <> 'rejected' AND (o.status <> 'pending_payment' OR o.expires_at > now()))),
flask_capacity = GREATEST(8, (SELECT COALESCE(SUM((cart->>'flask')::integer), 0) FROM orders o WHERE o.schedule_id = s.id AND o.status <> 'rejected' AND (o.status <> 'pending_payment' OR o.expires_at > now()))),
jug_capacity = GREATEST(3, (SELECT COALESCE(SUM((cart->>'jug')::integer), 0) FROM orders o WHERE o.schedule_id = s.id AND o.status <> 'rejected' AND (o.status <> 'pending_payment' OR o.expires_at > now())))
WHERE s.id >= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text;
ALTER TABLE orders ADD COLUMN manual_payment_status text CHECK (manual_payment_status IN ('paid', 'unpaid')), ADD COLUMN customer_name text;
