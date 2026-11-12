ALTER TABLE orders ADD COLUMN remarks TEXT;
ALTER TABLE orders ADD CONSTRAINT order_remarks_length CHECK (char_length(remarks) <= 500);
