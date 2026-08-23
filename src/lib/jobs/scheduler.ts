import "server-only";

import cron from "node-cron";

import { runActionPlanOverdueJob } from "@/lib/jobs/action-plan-overdue";
import { runAuditOverdueJob } from "@/lib/jobs/audit-overdue";
import { runCommTaskOverdueJob } from "@/lib/jobs/comm-task-overdue";
import { runContractExpiryJob } from "@/lib/jobs/contract-expiry";
import { runDbBackupJob } from "@/lib/jobs/db-backup";
import { runInvoiceOverdueJob } from "@/lib/jobs/invoice-overdue";
import { runOpeningLateJob } from "@/lib/jobs/opening-late";
import { runProspectFollowupJob } from "@/lib/jobs/prospect-followup";
import { runPurchaseAnomalyJob } from "@/lib/jobs/purchase-anomaly";
import { runRevenueDropJob } from "@/lib/jobs/revenue-drop";

// Jobs planifiés in-app (une seule instance app en prod → pas de double
// exécution). En dev, activer avec ENABLE_JOBS=true.
// Chaque job est idempotent : rejouable sans doublon (dedupeKey/marqueurs).

const globalScheduler = globalThis as unknown as { crmJobsStarted?: boolean };

export const JOBS: Record<string, () => Promise<unknown>> = {
  "db-backup": () => runDbBackupJob(),
  "contract-expiry": () => runContractExpiryJob(),
  "invoice-overdue": () => runInvoiceOverdueJob(),
  "action-plan-overdue": () => runActionPlanOverdueJob(),
  "revenue-drop": () => runRevenueDropJob(),
  "audit-overdue": () => runAuditOverdueJob(),
  "comm-task-overdue": () => runCommTaskOverdueJob(),
  "opening-late": () => runOpeningLateJob(),
  "prospect-followup": () => runProspectFollowupJob(),
  "purchase-anomaly": () => runPurchaseAnomalyJob(),
};

export function startScheduler() {
  const enabled =
    process.env.NODE_ENV === "production" || process.env.ENABLE_JOBS === "true";
  if (!enabled) return;
  if (globalScheduler.crmJobsStarted) return;
  globalScheduler.crmJobsStarted = true;

  cron.schedule("30 5 * * *", () => void safeRun("db-backup"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("0 6 * * *", () => void safeRun("contract-expiry"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("15 6 * * *", () => void safeRun("invoice-overdue"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("25 6 * * *", () => void safeRun("action-plan-overdue"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("30 6 * * *", () => void safeRun("revenue-drop"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("40 6 * * *", () => void safeRun("audit-overdue"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("50 6 * * *", () => void safeRun("comm-task-overdue"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("0 7 * * *", () => void safeRun("opening-late"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("10 7 * * *", () => void safeRun("prospect-followup"), {
    timezone: "Europe/Paris",
  });
  cron.schedule("20 7 * * *", () => void safeRun("purchase-anomaly"), {
    timezone: "Europe/Paris",
  });

  console.log(
    "[jobs] Planificateur démarré (05h30 db-backup, 06h00 contract-expiry, 06h15 invoice-overdue, 06h25 action-plan-overdue, 06h30 revenue-drop, 06h40 audit-overdue, 06h50 comm-task-overdue, 07h00 opening-late, 07h10 prospect-followup, 07h20 purchase-anomaly — Europe/Paris)."
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
