import { describe, expect, it } from "vitest";

import {
  parseFrenchAmount,
  parseFrenchDate,
} from "@/lib/csv/revenue-import";

describe("montants français", () => {
  it("accepte les formats courants", () => {
    expect(parseFrenchAmount("1234,56")).toBe("1234.56");
    expect(parseFrenchAmount("1234.56")).toBe("1234.56");
    expect(parseFrenchAmount("1 234,56")).toBe("1234.56");
    expect(parseFrenchAmount("1 234,56")).toBe("1234.56"); // insécable
    expect(parseFrenchAmount("1 234,56")).toBe("1234.56"); // fine
    expect(parseFrenchAmount("1500")).toBe("1500.00");
    expect(parseFrenchAmount("0,5")).toBe("0.50");
    expect(parseFrenchAmount("12,30 €")).toBe("12.30");
  });

  it("rejette l'illisible", () => {
    for (const bad of ["", "abc", "12,345", "12.34.56", "1.2e3"]) {
      expect(parseFrenchAmount(bad), bad).toBeNull();
    }
  });
});

describe("dates françaises", () => {
  it("accepte JJ/MM/AAAA et ISO", () => {
    expect(parseFrenchDate("21/08/2026")).toBe("2026-08-21");
    expect(parseFrenchDate("1/9/2026")).toBe("2026-09-01");
    expect(parseFrenchDate("2026-08-21")).toBe("2026-08-21");
  });

  it("rejette les dates impossibles", () => {
    expect(parseFrenchDate("32/01/2026")).toBeNull();
    expect(parseFrenchDate("29/02/2026")).toBeNull(); // non bissextile
    expect(parseFrenchDate("29/02/2028")).toBe("2028-02-29"); // bissextile
    expect(parseFrenchDate("21-08-2026")).toBeNull();
    expect(parseFrenchDate("")).toBeNull();
  });
});
