// Démarrage des tâches planifiées au boot du serveur Next (runtime Node
// uniquement — jamais en edge ni pendant le build).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/jobs/scheduler");
    startScheduler();
  }
}
