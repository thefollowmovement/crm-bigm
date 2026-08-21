import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";

// Test témoin : garantit que la base de test est joignable via Drizzle.
describe("outillage intégration", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("interroge la base de test", async () => {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });
  });
});
