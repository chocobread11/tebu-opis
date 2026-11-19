ALTER TABLE telegram_notifications ADD COLUMN event TEXT NOT NULL DEFAULT 'created';
ALTER TABLE telegram_notifications DROP CONSTRAINT telegram_notifications_pkey;
ALTER TABLE telegram_notifications ADD PRIMARY KEY (order_id,event);
