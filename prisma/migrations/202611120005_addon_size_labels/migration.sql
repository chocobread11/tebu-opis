-- Quantity is supplied by each order; size describes the unit only.
UPDATE products SET size = 'pouch'
WHERE id IN ('asam', 'limau') AND size = '1 pouch';
