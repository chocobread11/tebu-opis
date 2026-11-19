CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY,
 key_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ(6) NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions(expires_at);
