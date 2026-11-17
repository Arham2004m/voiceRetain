-- Products can now come from an external catalogue (dummyjson), so they carry a category,
-- and ones that drop out of the catalogue are retired (active = false) rather than deleted,
-- because existing carts and orders still point at them.
ALTER TABLE "Product" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "Product" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Product_active_category_idx" ON "Product"("active", "category");
