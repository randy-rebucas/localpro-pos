# health-check

Verify database, collections, tenants, and subscription plans are healthy.

## When to run
- After any Mongoose model schema change
- After adding a new model
- After a migration script
- After seeding or resetting data

## Steps
1. Ensure `.env.local` has `MONGODB_URI` set
2. `pnpm run health:check` — standard check
3. `pnpm run health:check:verbose` — if errors need more detail
4. If a collection is missing: check if the model is imported in `scripts/health-check.ts`. Add it if needed.

## Tenant and data operations
| Command | Effect |
|---------|--------|
| `pnpm run tenant:create` | Provision a new tenant |
| `pnpm run tenant:default` | Create the default tenant |
| `pnpm run seed:subscription-plans` | Seed subscription plan data |
| `pnpm run seed:sample-data` | Seed sample POS data |
| `pnpm run reset:collections` | **DESTRUCTIVE** — drops all collections |

Never run `reset:collections` in production.
