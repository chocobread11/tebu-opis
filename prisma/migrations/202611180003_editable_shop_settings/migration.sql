ALTER TABLE shop_settings
 ADD COLUMN merchant_name TEXT,
 ADD COLUMN support_whatsapp TEXT,
 ADD COLUMN site_url TEXT,
 ADD COLUMN telegram_enabled BOOLEAN,
 ADD COLUMN telegram_chat_id TEXT;
