import { describe, expect, it } from "vitest";

import {
  parseFrenchAmount,
  parseFrenchDate,
  parseRevenueCsv,
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

describe("parseRevenueCsv", () => {
  it("lit un export Excel français typique (BOM, ; , accents, libellés)", () => {
    const csv =
      "﻿Boutique;Date;Canal;Montant brut;Montant net\n" +
      "BM-001;21/08/2026;Sur place;1 234,56;\n" +
      "BM-001;21/08/2026;Uber Eats;500,00;450,00\n" +
      "BM-002;21/08/2026;À emporter;300;\n";
    const { rows, errors } = parseRevenueCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      storeCode: "BM-001",
      date: "2026-08-21",
      channel: "SUR_PLACE",
      grossAmount: "1234.56",
      netAmount: null,
    });
    expect(rows[1]).toMatchObject({ channel: "UBER_EATS", netAmount: "450.00" });
    expect(rows[2]).toMatchObject({ channel: "EMPORTE", grossAmount: "300.00" });
  });

  it("lit la colonne facultative nb_commandes et reste rétro-compatible sans elle", () => {
    const withOrders =
      "boutique;date;canal;montant_brut;nb_commandes\n" +
      "BM-001;21/08/2026;Sur place;1 234,56;1 118\n" +
      "BM-001;21/08/2026;Uber Eats;500,00;\n" +
      "BM-001;21/08/2026;Deliveroo;100,00;douze\n";
    const parsed = parseRevenueCsv(withOrders);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].orderCount).toBe(1118);
    expect(parsed.rows[1].orderCount).toBeNull();
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].message).toContain("Nombre de commandes");

    const without =
      "boutique;date;canal;montant_brut\nBM-001;21/08/2026;Sur place;100,00\n";
    const legacy = parseRevenueCsv(without);
    expect(legacy.errors).toEqual([]);
    expect(legacy.rows[0].orderCount).toBeNull();
  });

  it("accepte le séparateur virgule et les valeurs d'enum", () => {
    const csv =
      "boutique,date,canal,montant_brut\n" +
      "BM-001,2026-08-21,SUR_PLACE,100.00\n" +
      "BM-001,2026-08-21,DELIVEROO,50.25\n";
    const { rows, errors } = parseRevenueCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.channel)).toEqual(["SUR_PLACE", "DELIVEROO"]);
  });

  it("signale chaque ligne invalide avec son numéro réel", () => {
    const csv =
      "boutique;date;canal;montant_brut\n" +
      "BM-001;21/08/2026;Sur place;100,00\n" +
      "BM-001;21/08/2026;Fusée;100,00\n" +
      ";21/08/2026;Sur place;100,00\n" +
      "BM-001;99/99/2026;Sur place;100,00\n" +
      "BM-001;21/08/2026;Sur place;abc\n";
    const { rows, errors } = parseRevenueCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(4);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(errors[0].message).toContain("Canal inconnu");
    expect(errors[1].message).toContain("Code boutique manquant");
    expect(errors[2].message).toContain("Date invalide");
    expect(errors[3].message).toContain("Montant brut illisible");
  });

  it("le canal AUTRE conserve son libellé d'origine", () => {
    const csv = "boutique;date;canal;montant_brut\nBM-001;21/08/2026;Autre;10,00\n";
    const { rows } = parseRevenueCsv(csv);
    expect(rows[0].channel).toBe("AUTRE");
    expect(rows[0].channelLabel).toBe("Autre");
  });

  it("échoue proprement sur un fichier vide ou sans les bonnes colonnes", () => {
    expect(parseRevenueCsv("").errors[0].message).toContain("vide");
    const bad = parseRevenueCsv("a;b;c\n1;2;3\n");
    expect(bad.rows).toEqual([]);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.errors[0].line).toBe(1);
  });
});
