CREATE TABLE telegram_notifications (
 order_id UUID PRIMARY KEY,
 message TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 lease_until TIMESTAMPTZ(6),
 sent_at TIMESTAMPTZ(6),
 message_id INTEGER,
 last_error TEXT,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX telegram_notifications_sent_at_next_attempt_at_idx ON telegram_notifications(sent_at,next_attempt_at);
