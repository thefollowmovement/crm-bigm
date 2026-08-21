import { describe, expect, it } from "vitest";

import { formatMonthFr, monthsOfYear, percentChange } from "@/lib/analytics";
import { addDaysIso } from "@/lib/dates";

describe("percentChange", () => {
  it("calcule une hausse et une baisse, arrondies à 1 décimale", () => {
    expect(percentChange("1200.00", "1000.00")).toBe(20);
    expect(percentChange("900.00", "1000.00")).toBe(-10);
    expect(percentChange("1000.33", "1000.00")).toBe(0);
    expect(percentChange("1001.00", "1000.00")).toBe(0.1);
  });

  it("renvoie null quand la base N-1 est nulle (pas d'évolution calculable)", () => {
    expect(percentChange("500.00", "0")).toBeNull();
    expect(percentChange("500.00", "0.00")).toBeNull();
  });

  it("gère une base négative (avoir) sans inverser le signe", () => {
    expect(percentChange("0.00", "-100.00")).toBe(100);
  });

  it("rejette un montant mal formé", () => {
    expect(() => percentChange("12,5", "100.00")).toThrow();
  });
});

describe("monthsOfYear", () => {
  it("liste les 12 mois ISO de l'année", () => {
    const months = monthsOfYear(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });
});

describe("formatMonthFr", () => {
  it("formate un mois ISO en français", () => {
    expect(formatMonthFr("2026-01")).toMatch(/janv/i);
    expect(formatMonthFr("2026-01")).toContain("2026");
  });

  it("laisse passer une valeur inattendue sans lever", () => {
    expect(formatMonthFr("n/a")).toBe("n/a");
  });
});

describe("addDaysIso", () => {
  it("ajoute et retire des jours en franchissant les mois et années", () => {
    expect(addDaysIso("2026-08-21", 10)).toBe("2026-08-31");
    expect(addDaysIso("2026-08-21", 11)).toBe("2026-09-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29"); // bissextile
  });
});
