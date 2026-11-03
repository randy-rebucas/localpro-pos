import mongoose from 'mongoose';
import { logger } from '@/lib/logger';
import { validateConfig } from '@/lib/config';

// Validate required env vars on first import
validateConfig();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = (globalThis as any).mongoose || { conn: null, promise: null }; // eslint-disable-line @typescript-eslint/no-explicit-any

if (!(globalThis as any).mongoose) { // eslint-disable-line @typescript-eslint/no-explicit-any
  (globalThis as any).mongoose = cached; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Connection event handlers (registered once) ────────────────────────────

let eventsRegistered = false;

function registerConnectionEvents(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    cached.conn = null;
    cached.promise = null;
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', err);
    cached.conn = null;
    cached.promise = null;
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
}

// ─── Connect with retry ─────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      // Serverless instances come and go — don't hold idle sockets open
      minPoolSize: 0,
      // Building indexes on every cold start re-sends ~150 createIndex commands.
      // Indexes are built by `pnpm db:sync-indexes`. Auto-indexing is opt-in
      // (local `next dev`, or MONGOOSE_AUTO_INDEX=true) so scripts and tests that
      // run without NODE_ENV never build indexes on whatever DB they point at.
      autoIndex: process.env.NODE_ENV === 'development' || process.env.MONGOOSE_AUTO_INDEX === 'true',
    };

    registerConnectionEvents();

    cached.promise = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const conn = await mongoose.connect(MONGODB_URI, opts);
          logger.info('MongoDB connected');
          // Index reconciliation (incl. the transaction-index cleanup) is not run
          // here — it scanned the transactions collection on every cold start.
          // See scripts/sync-indexes.ts.
          return conn;
        } catch (e) {
          lastError = e;
          logger.warn(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed`, e as Record<string, unknown>);
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
          }
        }
      }
      throw lastError;
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    logger.error('MongoDB connection failed after retries', e);
    throw e;
  }

  return cached.conn;
}

export default connectDB;
