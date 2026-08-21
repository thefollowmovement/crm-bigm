import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { revenueEntries, stores, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { addDaysIso, addMonthsIso, startOfWeekIso, todayParis } from "@/lib/dates";
import { formatEUR, toCents } from "@/lib/money";
import { notify } from "@/services/notifications.service";

// Alerte « forte baisse de CA » (cdc §19) : CA des 7 derniers jours pleins
// comparé aux mêmes dates N-1 (repli : 7 jours précédents si N-1 vide).
// Ré-alerte hebdomadaire naturelle via le dedupeKey par semaine ISO — pas de
// colonne marqueur.

// Seuils (surclassables par l'environnement).
export function dropThresholdPct(): number {
  const raw = Number(process.env.REVENUE_DROP_THRESHOLD_PCT ?? "20");
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

// Base minimale pour éviter les fausses alertes sur volumes anecdotiques.
const MIN_BASE_CENTS = 20_000; // 200 €

// Décision pure (testée en unit) : baisse ≥ seuil sur une base significative.
export function shouldAlertDrop(input: {
  currentCents: number;
  baseCents: number;
  thresholdPct: number;
  minBaseCents?: number;
}): { alert: boolean; dropPct: number | null } {
  const minBase = input.minBaseCents ?? MIN_BASE_CENTS;
  if (input.baseCents < minBase) return { alert: false, dropPct: null };
  const dropPct =
    Math.round(((input.currentCents - input.baseCents) / input.baseCents) * 1000) / 10;
  return { alert: dropPct <= -input.thresholdPct, dropPct };
}

async function sumByStore(from: string, to: string) {
  const rows = await db
    .select({
      storeId: revenueEntries.storeId,
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
    })
    .from(revenueEntries)
    .where(and(gte(revenueEntries.date, from), lte(revenueEntries.date, to)))
    .groupBy(revenueEntries.storeId);
  return new Map(rows.map((r) => [r.storeId, toCents(r.gross)]));
}

export async function runRevenueDropJob(now: Date = new Date()) {
  const today = todayParis(now);
  const to = addDaysIso(today, -1);
  const from = addDaysIso(today, -7);
  // mêmes dates l'année précédente (calage au mois près, cdc §4 N vs N-1)
  const prevFrom = addMonthsIso(from, -12);
  const prevTo = addMonthsIso(to, -12);
  // repli : les 7 jours précédant la fenêtre courante
  const fallbackFrom = addDaysIso(today, -14);
  const fallbackTo = addDaysIso(today, -8);

  const [openStores, current, previous, fallback] = await Promise.all([
    db.query.stores.findMany({
      where: eq(stores.status, "OUVERTE"),
      columns: { id: true, code: true, name: true, animateurId: true },
    }),
    sumByStore(from, to),
    sumByStore(prevFrom, prevTo),
    sumByStore(fallbackFrom, fallbackTo),
  ]);

  const managers = await db.query.users.findMany({
    where: and(inArray(users.role, ["ADMIN", "DIRECTION"]), eq(users.isActive, true)),
    columns: { id: true },
  });
  const threshold = dropThresholdPct();
  const week = startOfWeekIso(today);

  let alerted = 0;
  let notified = 0;
  for (const store of openStores) {
    const currentCents = current.get(store.id) ?? 0;
    const baseCents = previous.get(store.id) ?? fallback.get(store.id) ?? 0;
    const decision = shouldAlertDrop({ currentCents, baseCents, thresholdPct: threshold });
    if (!decision.alert) continue;
    alerted += 1;

    const recipients = [
      ...managers.map((u) => u.id),
      ...(store.animateurId ? [store.animateurId] : []),
    ];
    notified += await notify(recipients, {
      type: "ALERTE",
      title: `Baisse de CA : ${store.code} (${String(decision.dropPct).replace(".", ",")} %)`,
      body: `${store.name} — 7 derniers jours : ${formatEUR((currentCents / 100).toFixed(2))} contre ${formatEUR((baseCents / 100).toFixed(2))} en référence.`,
      link: `/ca?boutique=${store.id}`,
      dedupeKey: `revenue-drop:${store.id}:${week}`,
    });

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "stores",
      recordId: store.id,
      snapshot: {
        alert: "revenue-drop",
        week,
        dropPct: decision.dropPct,
        currentCents,
        baseCents,
      },
    });
  }

  return { checked: openStores.length, alerted, notified };
}
