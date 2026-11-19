BEGIN;
ALTER TABLE orders ADD COLUMN fulfilled BOOLEAN NOT NULL DEFAULT false;
UPDATE orders SET fulfilled=true WHERE status='collected';
ALTER TABLE orders ADD COLUMN refunded_total INTEGER NOT NULL DEFAULT 0 CHECK(refunded_total>=0);
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE stock_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'restock';
ALTER TABLE stock_entries DROP CONSTRAINT stock_entries_quantity_check;
ALTER TABLE stock_entries ADD CONSTRAINT stock_entries_quantity_check CHECK ((kind='restock' AND quantity>0) OR (kind='adjustment' AND quantity<>0));
CREATE TABLE audit_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL DEFAULT 'admin',before JSONB,after JSONB,note TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_type_entity_id_created_at_idx ON audit_events(entity_type,entity_id,created_at);
CREATE TABLE refunds(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),request_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),cancel_order BOOLEAN NOT NULL DEFAULT false,order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,amount INTEGER NOT NULL CHECK(amount>0),reason TEXT NOT NULL,created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now());
CREATE INDEX refunds_order_id_idx ON refunds(order_id);
CREATE TABLE password_recoveries(token_hash TEXT PRIMARY KEY,customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ(6) NOT NULL,used_at TIMESTAMPTZ(6));
CREATE INDEX password_recoveries_customer_id_idx ON password_recoveries(customer_id);
COMMIT;
