import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { storeVisits, stores, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { daysBetweenIso, todayParis } from "@/lib/dates";
import { notify } from "@/services/notifications.service";

// Alerte « audit non réalisé » (cdc §19) : boutique ouverte sans audit
// FINALISÉ depuis AUDIT_MAX_DAYS jours (90 par défaut). Relance mensuelle
// naturelle via le dedupeKey par mois — pas de colonne marqueur.

export function auditMaxDays(): number {
  const raw = Number(process.env.AUDIT_MAX_DAYS ?? "90");
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

// Décision pure (testée en unit).
export function isAuditOverdue(
  lastAuditDate: string | null,
  today: string,
  maxDays: number
): boolean {
  if (!lastAuditDate) return true;
  return daysBetweenIso(lastAuditDate, today) > maxDays;
}

export async function runAuditOverdueJob(now: Date = new Date()) {
  const today = todayParis(now);
  const maxDays = auditMaxDays();

  const [openStores, lastAudits, managers] = await Promise.all([
    db.query.stores.findMany({
      where: eq(stores.status, "OUVERTE"),
      columns: { id: true, code: true, name: true, animateurId: true },
    }),
    db
      .select({
        storeId: storeVisits.storeId,
        lastDate: sql<string>`MAX(${storeVisits.visitDate})::text`,
      })
      .from(storeVisits)
      .where(and(eq(storeVisits.type, "AUDIT"), eq(storeVisits.status, "FINALISEE")))
      .groupBy(storeVisits.storeId),
    db.query.users.findMany({
      where: and(inArray(users.role, ["ADMIN", "DIRECTION"]), eq(users.isActive, true)),
      columns: { id: true },
    }),
  ]);
  const lastByStore = new Map(lastAudits.map((r) => [r.storeId, r.lastDate]));
  const month = today.slice(0, 7);

  let alerted = 0;
  let notified = 0;
  for (const store of openStores) {
    const lastDate = lastByStore.get(store.id) ?? null;
    if (!isAuditOverdue(lastDate, today, maxDays)) continue;
    alerted += 1;

    const recipients = [
      ...managers.map((u) => u.id),
      ...(store.animateurId ? [store.animateurId] : []),
    ];
    notified += await notify(recipients, {
      type: "ALERTE",
      title: `Audit à programmer : ${store.code}`,
      body: lastDate
        ? `${store.name} — dernier audit finalisé le ${lastDate}, au-delà de ${maxDays} jours.`
        : `${store.name} — aucun audit finalisé enregistré.`,
      link: `/animation/visites?boutique=${store.id}`,
      dedupeKey: `audit-overdue:${store.id}:${month}`,
    });

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "stores",
      recordId: store.id,
      snapshot: { alert: "audit-overdue", month, lastAuditDate: lastDate, maxDays },
    });
  }

  return { checked: openStores.length, alerted, notified };
}
