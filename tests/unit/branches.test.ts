import { describe, expect, it } from "vitest";

import { computeResult, ratioPct } from "@/services/branches.service";

describe("computeResult", () => {
  it("résultat = CA − achats − dépenses, en strings exactes", () => {
    expect(computeResult("10000.00", "3000.50", "2499.50")).toBe("4500.00");
    expect(computeResult("1000.00", "600.00", "700.00")).toBe("-300.00");
    expect(computeResult("0.00", "0.00", "0.00")).toBe("0.00");
  });
});

describe("ratioPct", () => {
  it("pourcentage à une décimale sur des centimes entiers, null si CA nul", () => {
    expect(ratioPct(450000, 1000000)).toBe(45);
    expect(ratioPct(-30000, 100000)).toBe(-30);
    expect(ratioPct(1, 3)).toBe(33.3);
    expect(ratioPct(100, 0)).toBeNull();
  });
});
