import { describe, expect, it } from "vitest";

import {
  addMonthsIso,
  daysBetweenIso,
  monthGridDays,
  startOfMonthIso,
  todayParis,
} from "@/lib/dates";
import { shouldAlertContract } from "@/lib/jobs/contract-expiry";

describe("dates civiles", () => {
  it("todayParis rend la date civile française, pas UTC", () => {
    // 23h30 UTC le 1er janvier = 00h30 le 2 janvier à Paris (UTC+1)
    expect(todayParis(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
    expect(todayParis(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06-15");
  });

  it("addMonthsIso écrête au dernier jour du mois", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29"); // bissextile
    expect(addMonthsIso("2026-08-21", 6)).toBe("2027-02-21");
    expect(addMonthsIso("2026-10-15", 3)).toBe("2027-01-15"); // passage d'année
  });

  it("daysBetweenIso calcule des différences signées", () => {
    expect(daysBetweenIso("2026-08-01", "2026-08-31")).toBe(30);
    expect(daysBetweenIso("2026-08-31", "2026-08-01")).toBe(-30);
    expect(daysBetweenIso("2026-08-21", "2026-08-21")).toBe(0);
  });

  it("startOfMonthIso retourne le premier jour du mois", () => {
    expect(startOfMonthIso("2026-08-24")).toBe("2026-08-01");
    expect(startOfMonthIso("2026-08-01")).toBe("2026-08-01");
  });

  it("monthGridDays complète les semaines avec les mois voisins", () => {
    // Août 2026 : le 1er est un samedi, le 31 un lundi → 6 semaines,
    // débordant sur juillet et septembre.
    const weeks = monthGridDays("2026-08-15");
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0]).toBe("2026-07-27");
    expect(weeks[0][6]).toBe("2026-08-02");
    expect(weeks[5][0]).toBe("2026-08-31");
    expect(weeks[5][6]).toBe("2026-09-06");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("monthGridDays sans débordement quand le mois tombe juste", () => {
    // Février 2027 : commence un lundi, 28 jours → 4 semaines exactes.
    const weeks = monthGridDays("2027-02-10");
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe("2027-02-01");
    expect(weeks[3][6]).toBe("2027-02-28");
  });
});

describe("décision d'alerte contrat", () => {
  const base = {
    status: "ACTIF" as const,
    endDate: "2026-12-01",
    alertMonthsBefore: 6,
    expiryAlertSentAt: null,
  };

  it("alerte quand l'échéance entre dans la fenêtre", () => {
    expect(shouldAlertContract(base, "2026-08-21")).toBe(true); // ~3 mois avant
    expect(shouldAlertContract(base, "2026-06-01")).toBe(true); // pile 6 mois avant
  });

  it("n'alerte pas trop tôt", () => {
    expect(shouldAlertContract(base, "2026-05-31")).toBe(false);
    expect(shouldAlertContract(base, "2025-01-01")).toBe(false);
  });

  it("respecte un délai personnalisé", () => {
    const custom = { ...base, alertMonthsBefore: 2 };
    expect(shouldAlertContract(custom, "2026-08-21")).toBe(false);
    expect(shouldAlertContract(custom, "2026-10-01")).toBe(true);
  });

  it("ignore contrats non actifs, sans échéance ou déjà alertés", () => {
    expect(shouldAlertContract({ ...base, status: "BROUILLON" }, "2026-11-01")).toBe(false);
    expect(shouldAlertContract({ ...base, endDate: null }, "2026-11-01")).toBe(false);
    expect(
      shouldAlertContract({ ...base, expiryAlertSentAt: new Date() }, "2026-11-01")
    ).toBe(false);
  });
});
