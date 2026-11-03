CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Customer_name_trgm_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Customer_phone_trgm_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX "Voucher_code_trgm_idx" ON "Voucher" USING GIN ("code" gin_trgm_ops);
CREATE INDEX "CallLog_summary_trgm_idx" ON "CallLog" USING GIN ("summary" gin_trgm_ops);

-- FR-3.7: at most one active call per customer, enforced in the database.
CREATE UNIQUE INDEX "CallLog_one_active_per_customer_idx"
  ON "CallLog" ("customerId")
  WHERE "status" IN ('RINGING', 'IN_PROGRESS');
