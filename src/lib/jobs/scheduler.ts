import "server-only";

import cron from "node-cron";

import { runContractExpiryJob } from "@/lib/jobs/contract-expiry";
import { runInvoiceOverdueJob } from "@/lib/jobs/invoice-overdue";

// Jobs planifiés in-app (une seule instance app en prod → pas de double
// exécution). En dev, activer avec ENABLE_JOBS=true.
// Chaque job est idempotent : rejouable sans doublon (dedupeKey/marqueurs).

const globalScheduler = globalThis as unknown as { crmJobsStarted?: boolean };

export const JOBS: Record<string, () => Promise<unknown>> = {
  "contract-expiry": () => runContractExpiryJob(),
  "invoice-overdue": () => runInvoiceOverdueJob(),
};

export function startScheduler() {
  const enabled =
    process.env.NODE_ENV === "production" || process.env.ENABLE_JOBS === "true";
  if (!enabled) return;
  if (globalScheduler.crmJobsStarted) return;
  globalScheduler.crmJobsStarted = true;

  cron.schedule("0 6 * * *", () => void safeRun("contract-expiry"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("15 6 * * *", () => void safeRun("invoice-overdue"), {
    timezone: "Europe/Paris",
  });

  console.log(
    "[jobs] Planificateur démarré (contract-expiry 06h00, invoice-overdue 06h15, Europe/Paris)."
  );
}

export async function safeRun(job: keyof typeof JOBS) {
  try {
    const result = await JOBS[job]();
    console.log(`[jobs] ${job} terminé :`, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error(`[jobs] ${job} en échec :`, error);
    throw error;
  }
}
