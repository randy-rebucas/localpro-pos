# PostgreSQL infrastructure

This directory sets up the database for Phase 1 of the Mongo → Postgres migration (see `docs/postgres-migration.md`). It installs one self-hosted VPS with:
- **PostgreSQL 17**, listening only on localhost
- **PgBouncer** on `:6432`, in transaction pooling mode, requiring TLS. This is the only port the app uses.
- **pgBackRest**, which takes encrypted backups and continuously archives the write-ahead log (WAL) to S3, so you can restore to any point in time

```
Vercel functions ──TLS──▶ PgBouncer :6432 ──▶ Postgres :5432 (localhost)
Your machine ──SSH tunnel──────────────────▶ Postgres :5432  (migrations, data copy)
Postgres ──WAL + backups──▶ S3 (pgBackRest)
```

| File | Purpose |
|---|---|
| `provision.sh` | Sets up a fresh Ubuntu 24.04 VPS. Safe to run again. |
| `provision.env.example` | The settings the script needs. Copy it to `provision.env`, which is gitignored. |
| `sql/roles.sql` | Creates the `pos_owner` (DDL), `pos_app` (read/write data only) and `pos_readonly` roles, plus default privileges |
| `init/01-extensions.sql` | Installs `pg_trgm`, `btree_gist`, `pgcrypto` and `pg_stat_statements`. Also used by `docker-compose.dev.yml`. |
| `templates/` | Config files for `postgresql.conf`, `pgbouncer.ini` and `pgbackrest.conf` |

## Local development

```bash
pnpm pg:up       # Postgres 17 on :5433, PgBouncer on :6432 (docker-compose.dev.yml)
pnpm pg:health   # needs DATABASE_URL / DATABASE_URL_DIRECT in .env.local
pnpm pg:down
```

Port 5433 avoids a clash with a native Postgres already running on 5432. To use a different port, set `PG_PORT=…`.

```
DATABASE_URL=postgres://pos:pos@localhost:6432/localpro_pos
DATABASE_URL_DIRECT=postgres://pos:pos@localhost:5433/localpro_pos
```

## Production VPS

### 1. Choose a size and region
- **Region:** put the VPS in the same region as the Vercel functions. For tenants in Manila, use Singapore (Vercel `sin1`).
  - Checkout runs 10–20 queries, so a round trip of more than 20 ms between the app and the database is noticeable.
  - Vercel currently runs in its default region (`iad1`, US East), and the app still uses Atlas. Pin Vercel to `sin1` **at cutover** (see the runbook in `docs/postgres-migration.md`), not before.
- **Size:** start with 2 vCPU, 4 GB RAM and an NVMe SSD at least 3× the Mongo data size from `pnpm db:size-report`.
  - The script sizes Postgres memory to the RAM it finds, so you can resize the VPS later and run it again.

### 2. DNS
Create an A record (for example `db.example.com`) that points to the VPS. The Let's Encrypt certificate needs it, and clients need it to connect with `sslmode=verify-full`.

### 3. Provision
```bash
scp -r infra/postgres <user>@<vps>:~/1pos-postgres
ssh <user>@<vps>
cd ~/1pos-postgres
cp provision.env.example provision.env && nano provision.env
sudo ./provision.sh provision.env
```

The script prints the connection strings when it finishes. It also saves the generated passwords and the **backup encryption passphrase** to `/root/1pos-db-credentials.env`. Copy that file into your password manager. Without the passphrase, the backups can't be restored.

### 4. Verify from your machine
```bash
ssh -N -L 15432:localhost:5432 <user>@db.example.com &   # tunnel for the direct connection
DATABASE_URL="postgres://pos_app:<pw>@db.example.com:6432/localpro_pos?sslmode=verify-full" \
DATABASE_URL_DIRECT="postgres://pos_owner:<pw>@localhost:15432/localpro_pos" \
pnpm pg:health
```

The script exits non-zero when any check fails:
- a remote connection without TLS
- a server older than version 17
- missing extensions

It only warns about latency, because latency from your laptop is not latency from Vercel.

### 5. Vercel
Add `DATABASE_URL` (the `pos_app` URL through PgBouncer) to the project's environment variables. **Keep `DB_DRIVER` unset (`mongo`) until cutover.** The app does not use Postgres yet.

## Security model
- **Postgres** listens only on localhost. Migrations and the data copy reach it through an SSH tunnel.
- **PgBouncer** is the only database port exposed. It requires TLS 1.2+ and SCRAM-SHA-256 authentication.
  - Vercel has no fixed outgoing IP addresses (unless you pay for Secure Compute), so `:6432` is open to all IPs. If you have fixed IPs, set `PGBOUNCER_ALLOW_FROM` in `provision.env` to restrict it.
- **Roles:**
  - `pos_app` can only read and write data, with no DDL. `statement_timeout` is 30s and `idle_in_transaction_session_timeout` is 60s.
  - `pos_owner` is deliberately **not** in the PgBouncer user list, so it can only connect through the tunnel.
  - `pos_readonly` is read-only by default (`default_transaction_read_only`).
- **Firewall (ufw):** SSH, `:6432`, and `:80` (only for Let's Encrypt renewal).

## Backups
- **Schedule:** a full backup on Sunday and a differential backup every other day, at 18:00 UTC (02:00 Manila). WAL is archived continuously, with `archive_timeout = 60s`, so at most about a minute of data can be lost.
- **Retention:** 4 full backups, about a month.
- **Status:** `sudo -u postgres pgbackrest --stanza=1pos info`
- **Monthly restore test:** do this on a scratch VPS or container. Do not do it on production.
  ```bash
  sudo systemctl stop postgresql@17-main
  sudo -u postgres pgbackrest --stanza=1pos --delta restore                       # latest
  sudo -u postgres pgbackrest --stanza=1pos --delta --type=time \
       --target="2026-11-03 10:00:00+00" restore                                  # point in time
  sudo systemctl start postgresql@17-main
  ```

## Tuning notes
- **Connection limits:** `max_connections = 100`. PgBouncer opens at most 60 connections to Postgres (`max_db_connections`), which leaves room for migrations, the data copy and backups.
  - Each Vercel function instance should keep a small pool of 3 connections, set in Phase 4's `lib/db/pg/client.ts`.
- **Transaction pooling:** only `SET LOCAL` is safe, because a session can move to a different server connection between transactions. Session-level `SET`, `LISTEN/NOTIFY` and session advisory locks will misbehave.
  - Prepared statements are supported (`max_prepared_statements = 200`).
- **Slow queries:** queries taking 500 ms or more are logged. Use `pg_stat_statements` to review slow queries after cutover.
