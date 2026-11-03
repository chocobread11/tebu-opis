ALTER TABLE customers ADD COLUMN password_hash text;
CREATE TABLE customer_sessions (
  token_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX customer_sessions_customer_id_idx ON customer_sessions(customer_id);
