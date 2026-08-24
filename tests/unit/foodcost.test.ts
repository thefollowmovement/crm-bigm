import { describe, expect, it } from "vitest";

import {
  computeRecipeCost,
  convertToBaseUnit,
  foodCostPct,
  formatTenThousandths,
  scaleAmount,
  toTenThousandths,
} from "@/lib/foodcost";

describe("toTenThousandths / formatTenThousandths", () => {
  it("convertit sans perte jusqu'à 4 décimales", () => {
    expect(toTenThousandths("0.1500")).toBe(BigInt(1500));
    expect(toTenThousandths("9.8")).toBe(BigInt(98000));
    expect(toTenThousandths("12")).toBe(BigInt(120000));
    expect(formatTenThousandths(BigInt(1500))).toBe("0.1500");
    expect(formatTenThousandths(BigInt(98000))).toBe("9.8000");
  });

  it("rejette les formats invalides", () => {
    expect(() => toTenThousandths("1,5")).toThrow();
    expect(() => toTenThousandths("1.23456")).toThrow();
    expect(() => toTenThousandths("")).toThrow();
  });
});

describe("scaleAmount (menus : coût produit × quantité)", () => {
  it("multiplie en entiers, arrondi half-up au centime", () => {
    expect(scaleAmount("1.23", "2.0000")).toBe("2.46");
    expect(scaleAmount("1.23", "1.0000")).toBe("1.23");
    expect(scaleAmount("2.50", "0.5000")).toBe("1.25");
    expect(scaleAmount("0.33", "3.0000")).toBe("0.99");
    expect(scaleAmount("0.01", "0.5000")).toBe("0.01"); // 0,005 → half-up
    expect(scaleAmount("1.40", "2.0000")).toBe("2.80");
  });
});

describe("convertToBaseUnit", () => {
  it("convertit grammes/millilitres vers kg/l, pièces telles quelles", () => {
    expect(convertToBaseUnit("150", "KG")).toBe("0.1500");
    expect(convertToBaseUnit("90", "KG")).toBe("0.0900");
    expect(convertToBaseUnit("330", "L")).toBe("0.3300");
    expect(convertToBaseUnit("150.5", "KG")).toBe("0.1505");
    expect(convertToBaseUnit("1", "PIECE")).toBe("1.0000");
    expect(convertToBaseUnit("0.5", "PIECE")).toBe("0.5000");
  });

  it("rejette les quantités illisibles", () => {
    expect(() => convertToBaseUnit("abc", "KG")).toThrow();
    expect(() => convertToBaseUnit("1.25", "KG")).toThrow(); // 2 décimales en g
  });
});

describe("computeRecipeCost", () => {
  it("calcule le coût matière exact avec arrondi half-up au centime", () => {
    // 90 g de steak à 9,80 €/kg + 1 pain à 0,35 € + 20 g de cheddar à 7,20 €/kg
    // = 0.882 + 0.35 + 0.144 = 1.376 → 1.38 €
    expect(
      computeRecipeCost([
        { quantity: "0.0900", pricePerUnit: "9.8000" },
        { quantity: "1.0000", pricePerUnit: "0.3500" },
        { quantity: "0.0200", pricePerUnit: "7.2000" },
      ])
    ).toBe("1.38");
    // demi-centime exact : 0.005 → 0.01 (half-up)
    expect(
      computeRecipeCost([{ quantity: "0.0500", pricePerUnit: "0.1000" }])
    ).toBe("0.01");
    // recette vide : 0.00
    expect(computeRecipeCost([])).toBe("0.00");
    // pas d'erreur flottante cumulative sur beaucoup de petites lignes
    expect(
      computeRecipeCost(
        Array.from({ length: 100 }, () => ({
          quantity: "0.0001",
          pricePerUnit: "0.1000",
        }))
      )
    ).toBe("0.00"); // 100 × 0.00001 € = 0.001 → 0.00
  });
});

describe("foodCostPct", () => {
  it("calcule la part du coût matière dans le prix de vente HT", () => {
    expect(foodCostPct("1.38", "9.00")).toBe("15.3");
    expect(foodCostPct("1.48", "9.00")).toBe("16.4");
    expect(foodCostPct("3.00", "9.00")).toBe("33.3");
    expect(foodCostPct("1.00", null)).toBeNull();
    expect(foodCostPct("1.00", "0.00")).toBeNull();
  });
});
