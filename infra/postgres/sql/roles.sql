-- Roles for the 1POS database. Run by provision.sh as the postgres superuser:
--   psql -v db_name=... -v owner_password=... -v app_password=... -v readonly_password=... -f roles.sql
--
--   pos_owner     owns the schema; used only by drizzle-kit migrations and the ETL (direct connection)
--   pos_app       the application (through PgBouncer); DML only, no DDL
--   pos_readonly  reporting, verification scripts, ad-hoc debugging

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE pos_owner LOGIN PASSWORD %L', :'owner_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_owner') \gexec
SELECT format('CREATE ROLE pos_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app') \gexec
SELECT format('CREATE ROLE pos_readonly LOGIN PASSWORD %L', :'readonly_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_readonly') \gexec

-- Re-running the script rotates the passwords
ALTER ROLE pos_owner PASSWORD :'owner_password';
ALTER ROLE pos_app PASSWORD :'app_password';
ALTER ROLE pos_readonly PASSWORD :'readonly_password';

-- Guard rails against runaway queries from the app
ALTER ROLE pos_app SET statement_timeout = '30s';
ALTER ROLE pos_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE pos_readonly SET statement_timeout = '5min';
ALTER ROLE pos_readonly SET default_transaction_read_only = on;

SELECT format('CREATE DATABASE %I OWNER pos_owner', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec

\connect :db_name

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO pos_owner;
GRANT USAGE ON SCHEMA public TO pos_app, pos_readonly;

-- Tables/sequences created later by pos_owner (migrations) are usable by the app
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO pos_readonly;

-- Objects that already exist (re-runs)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pos_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO pos_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pos_readonly;

-- pg_stat_statements for the health check and slow-query review
GRANT pg_read_all_stats TO pos_readonly;
