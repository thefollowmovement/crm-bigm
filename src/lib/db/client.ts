import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

// Client Drizzle de base, NON audité.
// ⚠️ Pour toute écriture métier, passer par les helpers audités de
// `src/lib/db/audited.ts` (étape 4) depuis la couche services — ce client-ci
// est réservé aux lectures, à l'audit lui-même, au seed et aux tests.
const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: NodePgDatabase<typeof schema>;
};

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

export const db = globalForDb.db ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
  globalForDb.db = db;
}
