"""Build PostgreSQL migration from this release's SQLite schema, without user data."""
from pathlib import Path
import sqlite3
if Path('supabase/migrations/202609160001_registry.sql').exists():
 raise SystemExit('Initial migration already exists. Create an additive migration with supabase migration new; never rewrite applied history.')
c=sqlite3.connect(':memory:')
for p in sorted(Path('drizzle').glob('*.sql')): c.executescript(p.read_text())
schema=c.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index') ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,rowid").fetchall()
out=Path('supabase/migrations');out.mkdir(parents=True,exist_ok=True)
sql='''-- FTAI dedicated server-only schema. Apply with a project administrator.
BEGIN;
CREATE SCHEMA ftai_private;
REVOKE ALL ON SCHEMA ftai_private FROM PUBLIC, anon, authenticated;
SET LOCAL search_path=ftai_private,pg_catalog;
'''
names=[]
for typ,name,ddl in schema:
 if name.startswith(('sqlite_','_cf_','__','d1_')):continue
 if typ=='table':names.append(name)
 sql+=ddl.replace('`','"')+';\n'
for name in names:
 sql+=f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON TABLE "{name}" FROM PUBLIC, anon, authenticated;\n'
sql+='''
CREATE FUNCTION ftai_private.protect_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=ftai_private,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FTAI_IDENTITY_CANNOT_BE_DELETED'; END IF;
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.created IS DISTINCT FROM OLD.created OR (NEW.owner IS DISTINCT FROM OLD.owner AND NOT EXISTS(SELECT 1 FROM erasure_authorizations WHERE agent=OLD.code)) THEN RAISE EXCEPTION 'FTAI_IDENTITY_LOCKED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ftai_identity_fields_locked BEFORE UPDATE OR DELETE ON agents FOR EACH ROW EXECUTE FUNCTION ftai_private.protect_identity();
CREATE FUNCTION ftai_private.protect_record() RETURNS trigger LANGUAGE plpgsql SET search_path=ftai_private,pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' OR NOT EXISTS(SELECT 1 FROM erasure_authorizations WHERE agent=OLD.agent) THEN RAISE EXCEPTION 'FTAI_LEDGER_IS_APPEND_ONLY'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER ftai_records_locked BEFORE UPDATE OR DELETE ON records FOR EACH ROW EXECUTE FUNCTION ftai_private.protect_record();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ftai_private FROM PUBLIC, anon, authenticated;
-- Set this dedicated login's password outside migration history.
CREATE ROLE ftai_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA ftai_private TO ftai_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ftai_private TO ftai_runtime;
'''
for name in names:sql+=f'CREATE POLICY ftai_server_only ON "{name}" FOR ALL TO ftai_runtime USING (true) WITH CHECK (true);\n'
sql+='COMMIT;\n'
(out/'202609160001_registry.sql').write_text(sql)
seed=Path('drizzle/0006_public_discovery.sql').read_text().split('--> statement-breakpoint')[2:]
(out/'202609160002_discovery.sql').write_text('BEGIN;\nSET LOCAL search_path=ftai_private,pg_catalog;\n'+''.join(seed)+'\nCOMMIT;\n')
print('Prepared PostgreSQL schema:',len(names),'protected tables; 1000-source seed')
