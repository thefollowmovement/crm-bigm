import { describe, expect, it } from "vitest";

import { parseProductSalesCsv } from "@/lib/csv/product-sales-import";

describe("parseProductSalesCsv", () => {
  it("lit un export français typique (BOM, ; , montant facultatif)", () => {
    const csv =
      "﻿Boutique;Date;Produit;Quantité;Montant\n" +
      "BM-001;21/08/2026;burger-xl;38;455,60\n" +
      "BM-001;21/08/2026;BOISSON-33;1 092;\n";
    const { rows, errors } = parseProductSalesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      storeCode: "BM-001",
      date: "2026-08-21",
      productCode: "BURGER-XL", // normalisé en majuscules
      quantity: 38,
      amount: "455.60",
    });
    expect(rows[1]).toMatchObject({ quantity: 1092, amount: null });
  });

  it("signale ligne par ligne les erreurs sans bloquer les lignes valides", () => {
    const csv =
      "boutique;date;produit;quantite\n" +
      "BM-001;21/08/2026;BURGER-XL;10\n" +
      ";21/08/2026;BURGER-XL;10\n" +
      "BM-001;32/01/2026;BURGER-XL;10\n" +
      "BM-001;21/08/2026;;10\n" +
      "BM-001;21/08/2026;BURGER-XL;3,5\n";
    const { rows, errors } = parseProductSalesCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
  });

  it("exige les colonnes obligatoires", () => {
    const { rows, errors } = parseProductSalesCsv("boutique;date\nBM-001;21/08/2026\n");
    expect(rows).toEqual([]);
    expect(errors.some((e) => e.message.includes("produit"))).toBe(true);
    expect(errors.some((e) => e.message.includes("quantite"))).toBe(true);
  });
});
