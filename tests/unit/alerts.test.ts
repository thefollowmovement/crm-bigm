import { describe, expect, it } from "vitest";

import { shouldAlertDrop } from "@/lib/jobs/revenue-drop";
import { isAuditOverdue } from "@/lib/jobs/audit-overdue";

describe("shouldAlertDrop", () => {
  it("alerte à partir du seuil de baisse, jamais sous la base minimale", () => {
    // Baisse de 25 % sur une base de 1 000 € → alerte à 20 %.
    expect(
      shouldAlertDrop({ currentCents: 75_000, baseCents: 100_000, thresholdPct: 20 })
    ).toEqual({ alert: true, dropPct: -25 });
    // Baisse de 10 % : sous le seuil.
    expect(
      shouldAlertDrop({ currentCents: 90_000, baseCents: 100_000, thresholdPct: 20 })
    ).toEqual({ alert: false, dropPct: -10 });
    // Pile au seuil : alerte.
    expect(
      shouldAlertDrop({ currentCents: 80_000, baseCents: 100_000, thresholdPct: 20 })
        .alert
    ).toBe(true);
    // Base anecdotique (< 200 €) : jamais d'alerte, même à -100 %.
    expect(
      shouldAlertDrop({ currentCents: 0, baseCents: 10_000, thresholdPct: 20 })
    ).toEqual({ alert: false, dropPct: null });
    // Hausse : pas d'alerte.
    expect(
      shouldAlertDrop({ currentCents: 150_000, baseCents: 100_000, thresholdPct: 20 })
        .alert
    ).toBe(false);
  });

  it("arrondit la variation à une décimale", () => {
    expect(
      shouldAlertDrop({ currentCents: 66_666, baseCents: 100_000, thresholdPct: 20 })
        .dropPct
    ).toBe(-33.3);
  });
});

describe("isAuditOverdue", () => {
  const today = "2026-08-21";
  it("détecte l'absence d'audit ou un audit trop ancien", () => {
    expect(isAuditOverdue(null, today, 90)).toBe(true);
    expect(isAuditOverdue("2026-01-01", today, 90)).toBe(true); // 232 jours
    expect(isAuditOverdue("2026-06-01", today, 90)).toBe(false); // 81 jours
    expect(isAuditOverdue("2026-05-23", today, 90)).toBe(false); // pile 90
    expect(isAuditOverdue("2026-05-22", today, 90)).toBe(true); // 91 jours
  });
});
