#!/usr/bin/env node
// Crée le compte administrateur initial au premier démarrage en production.
// Idempotent : ne fait rien si un utilisateur existe déjà.
// Dépendances (pg, @node-rs/argon2) présentes dans le node_modules standalone.
import process from "node:process";

try {
  process.loadEnvFile(".env");
} catch {
  /* variables déjà dans l'environnement */
}

const url = process.env.DATABASE_URL;
const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@bigm.fr").toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url) {
  console.error("[create-admin] DATABASE_URL manquante.");
  process.exit(1);
}
if (!password) {
  console.log("[create-admin] SEED_ADMIN_PASSWORD absent : étape ignorée.");
  process.exit(0);
}

const { default: pg } = await import("pg");
const { hash } = await import("@node-rs/argon2");

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users");
  if (rows[0].n > 0) {
    console.log("[create-admin] Des utilisateurs existent déjà : rien à faire.");
  } else {
    const passwordHash = await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, pole)
       VALUES ($1, $2, 'Admin', 'Big M', 'ADMIN', 'DIRECTION')`,
      [email, passwordHash]
    );
    console.log(`[create-admin] Compte administrateur créé : ${email}`);
  }
} finally {
  await pool.end();
}
