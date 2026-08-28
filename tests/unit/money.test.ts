import { describe, expect, it } from "vitest";

import {
  addAmounts,
  compareAmounts,
  computeTTC,
  formatEUR,
  fromCents,
  toCents,
} from "@/lib/money";

describe("arithmétique monétaire (centimes entiers)", () => {
  it("convertit strings ↔ centimes sans perte", () => {
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("0.1")).toBe(10);
    expect(toCents("7")).toBe(700);
    expect(fromCents(123456)).toBe("1234.56");
    expect(fromCents(5)).toBe("0.05");
  });

  it("rejette les formats invalides", () => {
    for (const bad of ["", "12,50", "1e3", "12.345", "abc", "12."]) {
      expect(() => toCents(bad), bad).toThrow();
    }
  });

  it("additionne et compare exactement (pièges du flottant)", () => {
    // 0.1 + 0.2 === 0.30000000000000004 en float — pas ici
    expect(addAmounts("0.10", "0.20")).toBe("0.30");
    expect(addAmounts()).toBe("0.00");
    expect(compareAmounts("100.00", "100.00")).toBe(0);
    expect(compareAmounts("99.99", "100.00")).toBe(-1);
    expect(compareAmounts("100.01", "100.00")).toBe(1);
  });

  it("calcule le TTC avec arrondi half-up au centime", () => {
    expect(computeTTC("1000.00", "20.00")).toBe("1200.00");
    expect(computeTTC("10.00", "5.50")).toBe("10.55");
    // 8.375 → 8.38 (half-up)
    expect(computeTTC("8.33", "0.54")).toBe("8.37");
    expect(computeTTC("0.01", "50.00")).toBe("0.02"); // 0.015 → half-up
    expect(computeTTC("100.00", "0.00")).toBe("100.00");
  });

  it("formate en euros français", () => {
    expect(formatEUR("1234.5")).toMatch(/1\s?234,50\s?€/);
  });
});
