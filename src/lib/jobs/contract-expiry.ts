import "server-only";

import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contracts, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { notify } from "@/services/notifications.service";
import { CONTRACT_TYPE_LABELS } from "@/lib/labels";

type ContractRow = typeof contracts.$inferSelect;

// Décision pure (testée en unit) : ce contrat doit-il déclencher l'alerte ?
export function shouldAlertContract(
  contract: Pick<
    ContractRow,
    "status" | "endDate" | "alertMonthsBefore" | "expiryAlertSentAt"
  >,
  today: string
): boolean {
  if (contract.status !== "ACTIF") return false;
  if (!contract.endDate) return false;
  if (contract.expiryAlertSentAt) return false;
  const threshold = addMonthsIso(today, contract.alertMonthsBefore);
  return contract.endDate <= threshold;
}

// Job quotidien : alerte N mois avant la fin de chaque contrat actif.
// Idempotent : dedupeKey par contrat + marqueur expiryAlertSentAt.
export async function runContractExpiryJob(now: Date = new Date()) {
  const today = todayParis(now);

  const candidates = await db.query.contracts.findMany({
    where: and(
      eq(contracts.status, "ACTIF"),
      isNotNull(contracts.endDate),
      isNull(contracts.expiryAlertSentAt)
    ),
    with: {
      store: { columns: { id: true, code: true, name: true, animateurId: true } },
    },
  });

  const toAlert = candidates.filter((c) => shouldAlertContract(c, today));
  let notified = 0;

  for (const contract of toAlert) {
    const managers = await db.query.users.findMany({
      where: and(
        inArray(users.role, ["ADMIN", "DIRECTION", "DEVELOPPEMENT"]),
        eq(users.isActive, true)
      ),
      columns: { id: true },
    });
    const recipients = [
      ...managers.map((u) => u.id),
      ...(contract.store.animateurId ? [contract.store.animateurId] : []),
    ];

    notified += await notify(recipients, {
      type: "CONTRAT_ECHEANCE",
      title: `Contrat ${contract.store.code} : échéance le ${formatDateFr(contract.endDate)}`,
      body: `${CONTRACT_TYPE_LABELS[contract.type]} de ${contract.store.name} — pensez au renouvellement.`,
      link: `/contrats/${contract.id}`,
      dedupeKey: `contract-expiry:${contract.id}`,
    });

    await db
      .update(contracts)
      .set({ expiryAlertSentAt: now })
      .where(eq(contracts.id, contract.id));

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "contracts",
      recordId: contract.id,
      changes: {
        expiryAlertSentAt: { old: null, new: now.toISOString() },
      },
    });
  }

  return { checked: candidates.length, alerted: toAlert.length, notified };
}
