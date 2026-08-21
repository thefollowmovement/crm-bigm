import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

// Vide toutes les tables applicatives entre deux tests (une seule requête
// TRUNCATE). Les tables internes de Drizzle (schéma "drizzle") sont épargnées.
export async function resetDb() {
  const result = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  const tables = result.rows as { tablename: string }[];
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(
      `TRUNCATE TABLE ${tables
        .map((t) => `"${t.tablename}"`)
        .join(", ")} RESTART IDENTITY CASCADE`
    )
  );
}
