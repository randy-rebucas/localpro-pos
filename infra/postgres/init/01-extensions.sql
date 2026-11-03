-- Extensions required by the 1POS Postgres schema (see docs/postgres-migration.md).
-- Runs automatically in docker-compose.dev.yml and from infra/postgres/provision.sh.

-- ILIKE / trigram indexes for the product, customer and super-admin searches that use $regex today
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Exclusion constraint that prevents overlapping staff bookings (tstzrange && per staff_id)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- gen_random_bytes / digest for token hashes and ad-hoc ids in SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Slow-query visibility during and after cutover (needs shared_preload_libraries)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
