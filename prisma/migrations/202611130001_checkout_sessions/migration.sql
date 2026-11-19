CREATE TABLE checkout_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE ON UPDATE CASCADE,
  expires_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX checkout_sessions_customer_id_idx ON checkout_sessions(customer_id);
ALTER TABLE orders ADD COLUMN checkout_session_hash TEXT;
ALTER TABLE orders ADD CONSTRAINT orders_checkout_session_hash_fkey
  FOREIGN KEY (checkout_session_hash) REFERENCES checkout_sessions(token_hash) ON DELETE SET NULL ON UPDATE CASCADE;
