import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  computeResult,
  createInvoice,
  importInvoices,
  listInvoices,
  listStructuresWithAggregates,
  updateInvoice,
} from "@/services/acct-invoices.service";
import { createStructure } from "@/services/acct-structures.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

function csvFile(content: string, name = "journal.csv"): File {
  return new File([Buffer.from(content, "utf8")], name, { type: "text/csv" });
}

async function comptaWithStructure() {
  const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
  const structure = await createStructure(compta, {
    code: "411CDPS",
    name: "Central DPS",
    type: "DPS",
  });
  return { compta, structure };
}

describe("journal des factures comptables", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("saisie manuelle : unicité de pièce, TVA déduite, statut modifiable", async () => {
    const { compta, structure } = await comptaWithStructure();
    const invoice = await createInvoice(compta, {
      pieceNumber: "FA2026-001",
      pieceType: "FACTURE",
      invoiceType: "STANDARD",
      accountClass: "PRODUIT",
      pieceDate: "2026-07-15",
      structureId: structure.id,
      amountHT: "1000.00",
      amountTTC: "1200.00",
    });
    expect(invoice.amountVAT).toBe("200.00");
    expect(invoice.status).toBe("EN_ATTENTE");
    expect(invoice.source).toBe("SAISIE");

    await expect(
      createInvoice(compta, {
        pieceNumber: "FA2026-001",
        pieceType: "FACTURE",
        invoiceType: "STANDARD",
        accountClass: "PRODUIT",
        pieceDate: "2026-07-16",
        structureId: structure.id,
        amountHT: "1.00",
        amountTTC: "1.20",
      })
    ).rejects.toThrow(/existe déjà/);

    const updated = await updateInvoice(compta, invoice.id, {
      status: "PAYEE",
      accountClass: "PRODUIT",
      invoiceType: "RFA",
    });
    expect(updated.status).toBe("PAYEE");
    expect(updated.invoiceType).toBe("RFA");

    const rh = asSession(await createTestUser({ role: "RH" }));
    await expect(listInvoices(rh)).rejects.toThrow(ForbiddenError);
  });

  it("import du journal : structure inconnue nommée, doublons selon le mode, statut jamais écrasé", async () => {
    const { compta } = await comptaWithStructure();

    const first = await importInvoices(
      compta,
      csvFile(
        [
          "Type de pièce;N° pièce;Date Pièce;Client;Société;Total HT;Total TVA;Total TTC",
          "Facture;FA1;01/07/2026;411CDPS;BIG M;1 000,00;200,00;1 200,00",
          "Avoir;AV1;02/07/2026;411CDPS;BIG M;-100,00;-20,00;-120,00",
          "Facture;FA2;03/07/2026;411INCONNU;BIG M;50,00;10,00;60,00",
        ].join("\n")
      ),
      "METTRE_A_JOUR",
      "PRODUIT"
    );
    expect(first.createdRows).toBe(2);
    const errors = first.errors as { message: string }[];
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("411INCONNU");

    // La compta pose un statut à la main…
    const [fa1] = await listInvoices(compta, { q: "FA1" });
    await updateInvoice(compta, fa1.id, { status: "PAYEE" });

    // …puis réimporte le même journal avec des montants corrigés :
    // montants réalignés, statut CONSERVÉ.
    const again = await importInvoices(
      compta,
      csvFile(
        [
          "Type de pièce;N° pièce;Date Pièce;Client;Total HT;Total TVA;Total TTC",
          "Facture;FA1;01/07/2026;411CDPS;1 100,00;220,00;1 320,00",
        ].join("\n")
      ),
      "METTRE_A_JOUR",
      "PRODUIT"
    );
    expect(again.updatedRows).toBe(1);
    const [fa1After] = await listInvoices(compta, { q: "FA1" });
    expect(fa1After.amountHT).toBe("1100.00");
    expect(fa1After.status).toBe("PAYEE");
    expect(fa1After.source).toBe("IMPORT_CSV");

    // Mode IGNORER : aucun changement.
    const ignored = await importInvoices(
      compta,
      csvFile(
        [
          "Type de pièce;N° pièce;Date Pièce;Client;Total HT;Total TVA;Total TTC",
          "Facture;FA1;01/07/2026;411CDPS;9 999,00;0,00;9 999,00",
        ].join("\n")
      ),
      "IGNORER",
      "PRODUIT"
    );
    expect(ignored.skippedRows).toBe(1);
    const [fa1Final] = await listInvoices(compta, { q: "FA1" });
    expect(fa1Final.amountHT).toBe("1100.00");
  });

  it("résultat = CA classe 7 − charges classe 6, avoirs négatifs inclus, annulées exclues", async () => {
    const { compta, structure } = await comptaWithStructure();
    const base = {
      pieceType: "FACTURE" as const,
      invoiceType: "STANDARD" as const,
      structureId: structure.id,
      pieceDate: "2026-07-10",
    };
    await createInvoice(compta, {
      ...base,
      pieceNumber: "P1",
      accountClass: "PRODUIT",
      amountHT: "1000.00",
      amountTTC: "1200.00",
    });
    await createInvoice(compta, {
      ...base,
      pieceNumber: "P2",
      pieceType: "AVOIR",
      accountClass: "PRODUIT",
      amountHT: "-100.00",
      amountTTC: "-120.00",
    });
    await createInvoice(compta, {
      ...base,
      pieceNumber: "C1",
      accountClass: "CHARGE",
      amountHT: "300.00",
      amountTTC: "360.00",
    });
    const cancelled = await createInvoice(compta, {
      ...base,
      pieceNumber: "C2",
      accountClass: "CHARGE",
      amountHT: "500.00",
      amountTTC: "600.00",
    });
    await updateInvoice(compta, cancelled.id, { status: "ANNULEE" });

    const result = await computeResult(compta, {
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(result.revenueHT).toBe("900.00"); // 1000 − 100
    expect(result.expensesHT).toBe("300.00"); // l'annulée est exclue
    expect(result.result).toBe("600.00");

    // Hors période : tout à zéro.
    const empty = await computeResult(compta, {
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(empty.result).toBe("0.00");
  });

  it("agrégats par structure : pièces, CA, résultat, restant dû, dernière pièce", async () => {
    const { compta, structure } = await comptaWithStructure();
    const other = await createStructure(compta, {
      code: "411ORAN",
      name: "Orangina",
      type: "FOURNISSEUR",
    });
    await createInvoice(compta, {
      pieceNumber: "P1",
      pieceType: "FACTURE",
      invoiceType: "STANDARD",
      accountClass: "PRODUIT",
      pieceDate: "2026-03-01",
      structureId: structure.id,
      amountHT: "1000.00",
      amountTTC: "1200.00",
    });
    const paid = await createInvoice(compta, {
      pieceNumber: "P2",
      pieceType: "FACTURE",
      invoiceType: "STANDARD",
      accountClass: "PRODUIT",
      pieceDate: "2026-04-01",
      structureId: structure.id,
      amountHT: "500.00",
      amountTTC: "600.00",
    });
    await updateInvoice(compta, paid.id, { status: "PAYEE" });
    await createInvoice(compta, {
      pieceNumber: "C1",
      pieceType: "FACTURE",
      invoiceType: "STANDARD",
      accountClass: "CHARGE",
      pieceDate: "2026-05-01",
      structureId: other.id,
      amountHT: "200.00",
      amountTTC: "240.00",
    });

    const rows = await listStructuresWithAggregates(compta, {
      from: "2026-01-01",
      to: "2026-12-31",
    });
    const dps = rows.find((r) => r.code === "411CDPS")!;
    expect(dps.pieceCount).toBe(2);
    expect(dps.revenueHT).toBe("1500.00");
    expect(dps.result).toBe("1500.00");
    // Restant dû : seule P1 (En attente) — la payée est soldée.
    expect(dps.amountDue).toBe("1200.00");
    expect(dps.lastPieceDate).toBe("2026-04-01");

    const oran = rows.find((r) => r.code === "411ORAN")!;
    expect(oran.expensesHT).toBe("200.00");
    expect(oran.result).toBe("-200.00");

    // Filtre « impayés en cours » : Orangina a une charge en attente aussi.
    const withDue = await listStructuresWithAggregates(compta, {
      from: "2026-01-01",
      to: "2026-12-31",
      impayes: true,
    });
    expect(withDue.map((r) => r.code).sort()).toEqual(["411CDPS", "411ORAN"]);
  });
});
