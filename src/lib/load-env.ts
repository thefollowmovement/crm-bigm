// Charge .env pour les scripts lancés hors de Next (seed via tsx, outils).
// À importer EN PREMIER : les modules qui lisent process.env à l'import
// (ex. le pool Postgres de src/lib/db/client.ts) doivent venir après.
// Les variables déjà présentes dans l'environnement gardent la priorité.
try {
  process.loadEnvFile(".env");
} catch {
  // pas de .env : les variables viennent de l'environnement (prod, CI)
}

export {};
