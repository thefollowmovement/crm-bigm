#!/usr/bin/env node
// Outil de base de données : applique les migrations Drizzle (dossier ./drizzle)
// sans dépendre d'un CLI externe — utilisable en dev, en test et dans le
// conteneur de prod au démarrage.
//
// Usage :
//   node scripts/db.mjs migrate   # applique les migrations manquantes
//   node scripts/db.mjs reset     # DROP SCHEMA public CASCADE + recréation
//   node scripts/db.mjs fresh     # reset + migrate
//
// La base cible est DATABASE_URL (chargée depuis .env si présent).

import process from "node:process";

try {
  process.loadEnvFile(".env");
} catch {
  /* pas de .env : variables déjà dans l'environnement */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante.");
  process.exit(1);
}

const { default: pg } = await import("pg");
const { drizzle } = await import("drizzle-orm/node-postgres");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

async function reset() {
  await pool.query('DROP SCHEMA IF EXISTS "public" CASCADE');
  await pool.query('CREATE SCHEMA "public"');
  await pool.query('DROP SCHEMA IF EXISTS "drizzle" CASCADE');
  console.log("Base réinitialisée.");
}

async function runMigrations() {
  const { existsSync } = await import("node:fs");
  const folder = new URL("../drizzle", import.meta.url).pathname;
  if (!existsSync(`${folder}/meta/_journal.json`)) {
    console.log("Aucune migration à appliquer (dossier drizzle/ vide).");
    return;
  }
  await migrate(db, { migrationsFolder: folder });
  console.log("Migrations appliquées.");
}

const command = process.argv[2];
try {
  switch (command) {
    case "migrate":
      await runMigrations();
      break;
    case "reset":
      await reset();
      break;
    case "fresh":
      await reset();
      await runMigrations();
      break;
    default:
      console.error("Commande inconnue :", command);
      console.error("Commandes : migrate | reset | fresh");
      process.exitCode = 1;
  }
} finally {
  await pool.end();
}
