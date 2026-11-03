/**
 * PostgreSQL schema (Drizzle) — one file per domain, mirroring the
 * repository domains in docs/postgres-migration.md. drizzle.config.ts points here.
 */
export * from './core';
export * from './org';
export * from './catalog';
export * from './sales';
export * from './customers';
export * from './operations';
export * from './billing';
export * from './audit';
