-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_id","product_id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "schedule_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "schedule_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "expenses_schedule_id_idx" ON "expenses"("schedule_id");

-- CreateIndex
CREATE INDEX "harvests_date_idx" ON "harvests"("date");

-- CreateIndex
CREATE INDEX "harvests_schedule_id_idx" ON "harvests"("schedule_id");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the live catalog before connecting historical cart entries.
INSERT INTO "products" ("id", "name", "size", "description", "kind", "price", "sort_order") VALUES
('flask', 'The Everyday Flask', '500 ml', 'Your desk-side pick-me-up.', 'bottle', 600, 0),
('jug', 'The Sharing Jug', '1 litre', 'A little more to go around.', 'bottle', 1100, 1),
('asam', 'Asam Boi', '1 pouch', 'Sweet meets salty.', 'addon', 100, 2),
('limau', 'Limau Kasturi', '1 pouch', 'A fresh citrus kick.', 'addon', 100, 3);

-- Existing orders retain their original total and cart snapshot.
INSERT INTO "order_items" ("order_id", "product_id", "quantity", "unit_price")
SELECT o.id, p.id, (o.cart ->> p.id)::integer, p.price
FROM "orders" o CROSS JOIN "products" p
WHERE COALESCE((o.cart ->> p.id)::integer, 0) > 0;

ALTER TABLE "products" ADD CONSTRAINT "product_price_positive" CHECK (price > 0);
ALTER TABLE "products" ADD CONSTRAINT "product_kind" CHECK (kind IN ('bottle', 'addon'));
ALTER TABLE "products" ADD CONSTRAINT "product_id" CHECK (id IN ('flask', 'jug', 'asam', 'limau'));
ALTER TABLE "order_items" ADD CONSTRAINT "item_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "item_price_positive" CHECK (unit_price > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expense_amount_positive" CHECK (amount > 0);
ALTER TABLE "harvests" ADD CONSTRAINT "harvest_quantity_positive" CHECK (quantity > 0);
