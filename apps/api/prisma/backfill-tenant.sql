-- Backfill tenantId on customer-owned rows that predate tenancy.
-- Everything with a NULL tenantId is assigned to the Direct channel (Investoyard).
-- Idempotent: only touches NULLs, safe to re-run.
UPDATE "User"            x SET "tenantId" = t.id FROM "Tenant" t WHERE t.type = 'direct' AND x."tenantId" IS NULL;
UPDATE "InvestorProfile" x SET "tenantId" = t.id FROM "Tenant" t WHERE t.type = 'direct' AND x."tenantId" IS NULL;
UPDATE "Consent"         x SET "tenantId" = t.id FROM "Tenant" t WHERE t.type = 'direct' AND x."tenantId" IS NULL;
UPDATE "Application"     x SET "tenantId" = t.id FROM "Tenant" t WHERE t.type = 'direct' AND x."tenantId" IS NULL;
UPDATE "WatchlistItem"   x SET "tenantId" = t.id FROM "Tenant" t WHERE t.type = 'direct' AND x."tenantId" IS NULL;
UPDATE "DeviceToken"     x SET "tenantId" = t.id FROM "Tenant" t WHERE t.type = 'direct' AND x."tenantId" IS NULL;
