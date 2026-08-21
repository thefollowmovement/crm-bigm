import { execSync } from "node:child_process";

// Réinitialise la base de test et applique les migrations une fois avant
// toute la suite d'intégration (les migrations réelles sont ainsi testées).
export default function globalSetup() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // pas de .env : variables déjà dans l'environnement
  }

  const testUrl =
    process.env.TEST_DATABASE_URL ??
    "postgresql://crm_test:crm_test@localhost:5433/crm_test";

  execSync("node scripts/db.mjs fresh", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
