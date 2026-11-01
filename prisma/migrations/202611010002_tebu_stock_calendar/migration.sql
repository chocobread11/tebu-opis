-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "closed_reason" TEXT,
ADD COLUMN     "removed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "variety_id" TEXT,
ADD COLUMN     "variety_name" TEXT;

-- AlterTable
ALTER TABLE "harvests" ADD COLUMN     "flask_qty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jug_qty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variety_id" TEXT;

-- CreateTable
CREATE TABLE "cane_varieties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cane_varieties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "harvests_variety_id_idx" ON "harvests"("variety_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_variety_id_fkey" FOREIGN KEY ("variety_id") REFERENCES "cane_varieties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_variety_id_fkey" FOREIGN KEY ("variety_id") REFERENCES "cane_varieties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO cane_varieties(id, name, sort_order) VALUES ('tebu-1', 'Tebu 1', 0), ('tebu-2', 'Tebu 2', 1);
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvest_quantity_positive;
ALTER TABLE harvests ADD CONSTRAINT harvest_quantity_nonnegative CHECK (quantity >= 0);
ALTER TABLE harvests ADD CONSTRAINT harvest_flask_nonnegative CHECK (flask_qty >= 0);
ALTER TABLE harvests ADD CONSTRAINT harvest_jug_nonnegative CHECK (jug_qty >= 0);
ALTER TABLE cane_varieties ADD CONSTRAINT cane_variety_id CHECK (id IN ('tebu-1', 'tebu-2'));
-- Legacy measurements stay unassigned until the operator chooses their actual variety.
-- Ready-bottle counts start at zero; cane weight is never converted into saleable stock.
