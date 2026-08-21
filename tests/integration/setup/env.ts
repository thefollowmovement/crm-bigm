// Chargé avant chaque fichier de test d'intégration : bascule Prisma sur la
// base de test. Ne JAMAIS pointer DATABASE_URL vers la base de dev ici.
try {
  process.loadEnvFile(".env");
} catch {
  // pas de .env (CI) : les variables viennent de l'environnement
}

const testUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://crm_test:crm_test@localhost:5433/crm_test";

process.env.DATABASE_URL = testUrl;
