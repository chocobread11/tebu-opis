CREATE TABLE shop_settings (
  id TEXT PRIMARY KEY DEFAULT 'main' CHECK (id='main'),
  whatsapp_opening TEXT NOT NULL CHECK (length(trim(whatsapp_opening)) BETWEEN 1 AND 1000),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
INSERT INTO shop_settings(id,whatsapp_opening) VALUES ('main','Hi {name}! Here is your Tebu Drop ticket {tag}. Check packing, pantry drop and collection status here:');
