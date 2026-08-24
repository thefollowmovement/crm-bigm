import "server-only";

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { dpsPurchases, revenueEntries, users } from "@/db/schema";
import { todayParis } from "@/lib/dates";
import { getMaterialVariance } from "@/services/material-variance.service";
import { purchaseRatioPct } from "@/services/purchases.service";
import { notify } from "@/services/notifications.service";

// Job mensuel (rejoué chaque jour, dedupeKey au mois) : détecte sur le MOIS
// PRÉCÉDENT un ratio achats/CA hors bornes ou un écart matière excessif.
// Seuils en env : PURCHASE_RATIO_MIN_PCT (déf. 20), PURCHASE_RATIO_MAX_PCT
// (déf. 40), MATERIAL_VARIANCE_MAX_PCT (déf. 15).

// ── Décision pure (testée en unit) ───────────────────────────────

export function isPurchaseAnomalous(
  input: { ratioPct: string | null; variancePct: number | null },
  thresholds: { minRatio: number; maxRatio: number; maxVariancePct: number }
): { anomalous: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.ratioPct !== null) {
    const ratio = Number(input.ratioPct);
    if (ratio < thresholds.minRatio) {
      reasons.push(`ratio achats/CA anormalement bas (${input.ratioPct} %)`);
    } else if (ratio > thresholds.maxRatio) {
      reasons.push(`ratio achats/CA anormalement haut (${input.ratioPct} %)`);
    }
  }
  if (
    input.variancePct !== null &&
    Math.abs(input.variancePct) > thresholds.maxVariancePct
  ) {
    reasons.push(
      `écart matière de ${String(input.variancePct).replace(".", ",")} %`
    );
  }
  return { anomalous: reasons.length > 0, reasons };
}

function readThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

// Seuils courants (réutilisés par les info-bulles des pages Achats/Food Cost).
export function purchaseThresholds() {
  return {
    minRatio: readThreshold("PURCHASE_RATIO_MIN_PCT", 20),
    maxRatio: readThreshold("PURCHASE_RATIO_MAX_PCT", 40),
    maxVariancePct: readThreshold("MATERIAL_VARIANCE_MAX_PCT", 15),
  };
}

// Actor système pour les lectures de services (le job tourne sans session).
const SYSTEM_ACTOR = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "system@bigm.fr",
  firstName: "Système",
  lastName: "Jobs",
  role: "ADMIN" as const,
  pole: null,
  franchiseeId: null,
};

export async function runPurchaseAnomalyJob(now: Date = new Date()) {
  const today = todayParis(now);
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  // mois précédent complet
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const from = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const toExclusive = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthKey = from.slice(0, 7);

  const thresholds = purchaseThresholds();

  const [revenueRows, purchaseRows, variance, storeRows] = await Promise.all([
    db
      .select({
        storeId: revenueEntries.storeId,
        total: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::numeric(12,2)::text`,
      })
      .from(revenueEntries)
      .where(and(gte(revenueEntries.date, from), lt(revenueEntries.date, toExclusive)))
      .groupBy(revenueEntries.storeId),
    db
      .select({
        storeId: dpsPurchases.storeId,
        total: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::numeric(12,2)::text`,
      })
      .from(dpsPurchases)
      .where(and(gte(dpsPurchases.date, from), lt(dpsPurchases.date, toExclusive)))
      .groupBy(dpsPurchases.storeId),
    getMaterialVariance(SYSTEM_ACTOR, prevYear, prevMonth),
    db.query.stores.findMany({ columns: { id: true, code: true, name: true } }),
  ]);

  const revenueByStore = new Map(revenueRows.map((r) => [r.storeId, r.total]));
  const varianceByStore = new Map(variance.map((v) => [v.store.id, v]));
  const storeById = new Map(storeRows.map((s) => [s.id, s]));

  const recipients = await db.query.users.findMany({
    where: and(
      inArray(users.pole, ["DIRECTION", "COMPTABILITE"]),
      eq(users.isActive, true)
    ),
    columns: { id: true },
  });

  // Toutes les boutiques avec achats OU écart matière évalué sur le mois.
  const storeIds = new Set<string>([
    ...purchaseRows.map((r) => r.storeId),
    ...variance.map((v) => v.store.id),
  ]);

  let checked = 0;
  let anomalies = 0;
  let notified = 0;
  for (const storeId of storeIds) {
    const store = storeById.get(storeId);
    if (!store) continue;
    checked += 1;

    const revenue = revenueByStore.get(storeId) ?? "0.00";
    const purchases =
      purchaseRows.find((r) => r.storeId === storeId)?.total ?? "0.00";
    const storeVariance = varianceByStore.get(storeId);

    const decision = isPurchaseAnomalous(
      {
        ratioPct: purchaseRatioPct(purchases, revenue),
        variancePct: storeVariance?.variancePct ?? null,
      },
      thresholds
    );
    if (!decision.anomalous) continue;

    anomalies += 1;
    notified += await notify(
      recipients.map((u) => u.id),
      {
        type: "ALERTE",
        title: `Achats ${store.code} : anomalie sur ${monthKey}`,
        body: decision.reasons.join(" · "),
        link: `/achats`,
        dedupeKey: `purchase-anomaly:${storeId}:${monthKey}`,
      }
    );
  }

  return { checked, anomalies, notified };
}
