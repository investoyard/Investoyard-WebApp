-- Investoyard — Row-Level Security hardening.
-- Run as the postgres superuser (DDL + policy owner). Idempotent; safe to re-run.
--
-- Model: the app connects at runtime as the non-superuser role `investoyard_app`
-- (NOBYPASSRLS) and sets `app.current_tenant_id` per operation (transaction-local,
-- via PrismaService). Policies admit a row when that GUC is unset (internal/worker
-- and superuser paths — e.g. rail callbacks that are tenant-agnostic) OR when the
-- row's tenantId equals the GUC. Superusers (postgres) always bypass RLS, so
-- migrations and seeding are unaffected.

-- 1) Dedicated runtime role (trust auth → no password needed on this dev box).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'investoyard_app') THEN
    CREATE ROLE investoyard_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2) Privileges (current + future objects).
GRANT USAGE ON SCHEMA public TO investoyard_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO investoyard_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO investoyard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO investoyard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO investoyard_app;

-- 3) Enable + FORCE RLS and install the tenant-isolation policy on scoped tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','InvestorProfile','Consent','Application','WatchlistItem','DeviceToken']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (
        current_setting('app.current_tenant_id', true) IS NULL
        OR current_setting('app.current_tenant_id', true) = ''
        OR "tenantId" = current_setting('app.current_tenant_id', true)
      )
      WITH CHECK (
        current_setting('app.current_tenant_id', true) IS NULL
        OR current_setting('app.current_tenant_id', true) = ''
        OR "tenantId" = current_setting('app.current_tenant_id', true)
      )
    $f$, t);
  END LOOP;
END $$;
