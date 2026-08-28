import { describe, expect, it } from "vitest";

import { parseInvoiceRows } from "@/lib/import/invoices-import";

const HEADER = [
  "Type de pièce",
  "N° pièce",
  "Date Pièce",
  "Client",
  "Société",
  "Total HT",
  "Total TVA",
  "Total TTC",
];

describe("mapping du journal Factures / Avoirs", () => {
  it("mappe les colonnes réelles de l'export comptable", () => {
    const { rows, errors } = parseInvoiceRows([
      HEADER,
      ["Facture", "FA2026-001", "15/07/2026", "411CDPS", "BIG M CIE", "1 000,00", "200,00", "1 200,00"],
      ["Avoir", "AV2026-002", "16/07/2026", "411CDPS", "BIG M CIE", "-100,00", "-20,00", "-120,00"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      line: 2,
      pieceNumber: "FA2026-001",
      pieceType: "FACTURE",
      pieceDate: "2026-07-15",
      clientCode: "411CDPS",
      company: "BIG M CIE",
      amountHT: "1000.00",
      amountVAT: "200.00",
      amountTTC: "1200.00",
    });
    // L'avoir conserve ses montants négatifs (cdc §3.2).
    expect(rows[1]).toMatchObject({
      pieceType: "AVOIR",
      amountHT: "-100.00",
      amountTTC: "-120.00",
    });
  });

  it("TVA absente de l'export → déduite TTC − HT en centimes", () => {
    const { rows, errors } = parseInvoiceRows([
      ["Type de pièce", "N° pièce", "Date Pièce", "Client", "Total HT", "Total TTC"],
      ["Facture", "FA1", "01/07/2026", "411A", "10,10", "12,12"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0].amountVAT).toBe("2.02");
  });

  it("colonnes obligatoires manquantes signalées par leur libellé", () => {
    const { errors } = parseInvoiceRows([["Client", "Total HT"], []]);
    const messages = errors.map((e) => e.message).join(" ");
    expect(messages).toContain("N° pièce");
    expect(messages).toContain("Type de pièce");
    expect(messages).toContain("Total TTC");
  });

  it("erreurs ligne à ligne : type inconnu, date invalide, doublon de pièce", () => {
    const { rows, errors } = parseInvoiceRows([
      HEADER,
      ["Facture", "FA1", "01/07/2026", "411A", "", "10,00", "2,00", "12,00"],
      ["Ticket", "FA2", "01/07/2026", "411A", "", "10,00", "2,00", "12,00"],
      ["Facture", "FA3", "pas-une-date", "411A", "", "10,00", "2,00", "12,00"],
      ["Facture", "FA1", "02/07/2026", "411A", "", "20,00", "4,00", "24,00"],
      ["Facture", "", "03/07/2026", "411A", "", "20,00", "4,00", "24,00"],
    ]);
    expect(rows.map((r) => r.pieceNumber)).toEqual(["FA1"]);
    expect(errors).toHaveLength(4);
    expect(errors[0].message).toContain("Type de pièce invalide");
    expect(errors[1].message).toContain("Date de pièce invalide");
    expect(errors[2].message).toContain("plusieurs fois");
    expect(errors[3].message).toContain("N° de pièce manquant");
  });

  it("les abréviations FA / AV des logiciels comptables sont reconnues", () => {
    const { rows, errors } = parseInvoiceRows([
      HEADER,
      ["FA", "P1", "01/07/2026", "411A", "", "10,00", "2,00", "12,00"],
      ["AV", "P2", "01/07/2026", "411A", "", "-5,00", "-1,00", "-6,00"],
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.pieceType)).toEqual(["FACTURE", "AVOIR"]);
  });

  // Étape 51 : colonne STATUT ajoutée par le client dans son export.
  describe("colonne STATUT optionnelle", () => {
    const HEADER_STATUS = [...HEADER, "STATUT"];

    it("absente du fichier → status null (statut géré à la main)", () => {
      const { rows, errors } = parseInvoiceRows([
        HEADER,
        ["Facture", "FA1", "01/07/2026", "411A", "", "10,00", "2,00", "12,00"],
      ]);
      expect(errors).toEqual([]);
      expect(rows[0].status).toBeNull();
    });

    it("mappe les libellés français, accents et casse indifférents", () => {
      const { rows, errors } = parseInvoiceRows([
        HEADER_STATUS,
        ["Facture", "P1", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", "Payé"],
        ["Facture", "P2", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", "IMPAYÉ"],
        ["Facture", "P3", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", "en retard"],
        ["Facture", "P4", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", "En attente"],
        ["Facture", "P5", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", "Annulé"],
        ["Facture", "P6", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", ""],
      ]);
      expect(errors).toEqual([]);
      expect(rows.map((r) => r.status)).toEqual([
        "PAYEE",
        "IMPAYEE",
        "EN_RETARD",
        "EN_ATTENTE",
        "ANNULEE",
        null,
      ]);
    });

    it("valeur inconnue → erreur de ligne nommant la valeur et la pièce", () => {
      const { rows, errors } = parseInvoiceRows([
        HEADER_STATUS,
        ["Facture", "P1", "01/07/2026", "411A", "", "10,00", "2,00", "12,00", "Réglé"],
      ]);
      expect(rows).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Statut invalide");
      expect(errors[0].message).toContain("Réglé");
      expect(errors[0].message).toContain("P1");
    });
  });
});
