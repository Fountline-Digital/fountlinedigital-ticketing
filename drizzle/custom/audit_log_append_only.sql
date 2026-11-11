-- Makes audit_log append-only. Nobody (admins included) can edit or delete entries.
-- The only exception is the archive job, which copies old entries to Cloudflare R2
-- and then deletes them, after setting:  SET LOCAL app.audit_archiving = 'on';
--
-- How to apply with Drizzle:
--   npx drizzle-kit generate --custom --name=audit_log_append_only
--   paste this file's contents into the generated .sql file
--   npx drizzle-kit migrate

CREATE OR REPLACE FUNCTION audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.audit_archiving', true) = 'on'
     AND OLD.created_at < now() - interval '30 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();

-- Also block TRUNCATE.
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();
