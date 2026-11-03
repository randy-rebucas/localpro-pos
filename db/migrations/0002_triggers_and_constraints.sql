-- Things Drizzle's schema builder cannot express.

-- updated_at maintenance for writes that bypass Drizzle's $onUpdate (raw SQL,
-- psql, scripts). The ETL sets session_replication_role = replica, which
-- skips these triggers so copied updated_at values are preserved.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Attaches the trigger to every public table with an updated_at column that
-- doesn't have it yet. Later migrations that add tables call it again:
--   SELECT ensure_updated_at_triggers();
CREATE OR REPLACE FUNCTION ensure_updated_at_triggers() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tg
        WHERE tg.tgrelid = format('public.%I', c.table_name)::regclass
          AND tg.tgname = c.table_name || '_set_updated_at'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      tbl || '_set_updated_at', tbl
    );
  END LOOP;
END;
$$;
--> statement-breakpoint
SELECT ensure_updated_at_triggers();
--> statement-breakpoint

-- Replaces the overlap query in the Booking pre-save hook (models/Booking.ts):
-- a staff member can't have two pending/confirmed bookings whose [start, end)
-- ranges overlap. Back-to-back bookings are allowed. The repository maps
-- SQLSTATE 23P01 to "Staff member has an overlapping booking during this time".
-- The ETL must check existing data for overlaps before this can be applied.
ALTER TABLE bookings ADD CONSTRAINT bookings_staff_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    staff_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (staff_id IS NOT NULL AND status IN ('pending', 'confirmed'));
