import { Pool } from "pg";
import { validateEnv } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

validateEnv();

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: false,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}
