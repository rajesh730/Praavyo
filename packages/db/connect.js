import mongoose from 'mongoose';

/**
 * The one MongoDB connection, shared by pravyo.com and cas.pravyo.com.
 *
 * Cached on `globalThis` so a hot reload in development reuses the existing
 * connection instead of opening a new one each time — without this, API route
 * traffic grows connections without bound.
 *
 * The super-admin seeding the Pravyo app used to run from here is deliberately
 * NOT part of this helper: a shared connection module should open a connection
 * and nothing else, and CAS must never write an account. The Pravyo app keeps
 * that step in its own wrapper.
 */
let cached = globalThis.__pravyoMongoose;
if (!cached) {
  cached = globalThis.__pravyoMongoose = { conn: null, promise: null };
}

export default async function connectDB() {
  // Read the URI on CALL, not at module load. ESM hoists imports above
  // statements, so a script that does `import connectDB` then `dotenv.config()`
  // would otherwise capture an undefined URI before its .env.local was read.
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Define MONGODB_URI in .env.local before connecting');
  }
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      // 15s, not the 5s default: a paused Atlas M0 can take longer than 5s to
      // resume, and a short timeout turns the first visit after idle into an
      // error page rather than a slow but successful load.
      serverSelectionTimeoutMS: 15000,
      // The driver default of 100 is far too high for serverless — each
      // instance would try to hold up to 100 connections. Keep a small warm
      // pool so requests reuse connections instead of paying the TLS and auth
      // handshake every time.
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 60000,
      // Index creation is explicit per app. CAS and Pravyo share a database,
      // so neither may build indexes on collections it does not own.
      autoIndex: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Clear the cached promise so the next request retries rather than being
    // handed a permanently rejected one.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export { mongoose };
