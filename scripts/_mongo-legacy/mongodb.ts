import mongoose from 'mongoose';

/**
 * Minimal, self-contained Mongo connector for the one-time sync script only
 * (scripts/sync-mongo-updates.ts). Reads MONGODB_URI lazily, at call time,
 * so it works regardless of import-hoisting order relative to dotenv.config().
 */
let conn: typeof mongoose | null = null;

async function connectDB(): Promise<typeof mongoose> {
  if (conn) return conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }

  conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });
  return conn;
}

export default connectDB;
