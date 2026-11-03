-- Extensions the schema depends on. All three are "trusted" (Postgres 13+),
-- so the database owner (pos_owner) can create them without superuser.
-- pg_stat_statements is not trusted; provision.sh / docker-compose install it.

-- GIN trigram indexes for the ILIKE searches that replace $regex
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- EXCLUDE constraint for overlapping staff bookings (0002)
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
