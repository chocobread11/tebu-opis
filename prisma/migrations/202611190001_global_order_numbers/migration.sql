BEGIN;

-- Keep issued ticket references unchanged. Start after the largest issued number,
-- including deleted orders retained in the change history.
LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE order_reference_sequence AS BIGINT MINVALUE 1 NO CYCLE;
SELECT setval('order_reference_sequence', COALESCE(MAX(number), 0) + 1, false)
FROM (
  SELECT substring(tag FROM '^#A([0-9]+)$')::bigint AS number FROM orders
  UNION ALL
  SELECT substring("before"->>'tag' FROM '^#A([0-9]+)$')::bigint FROM audit_events WHERE entity_type = 'order'
  UNION ALL
  SELECT substring("after"->>'tag' FROM '^#A([0-9]+)$')::bigint FROM audit_events WHERE entity_type = 'order'
) AS issued;

CREATE FUNCTION next_order_tag() RETURNS TEXT
LANGUAGE SQL VOLATILE AS $$
  SELECT '#A' || CASE WHEN number < 10 THEN '0' ELSE '' END || number::text
  FROM nextval('order_reference_sequence') AS counter(number);
$$;

ALTER TABLE orders ALTER COLUMN tag SET DEFAULT next_order_tag();
COMMIT;
