import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import { canDownloadFile } from "@/lib/files/access";
import {
  changeTransmissionStatus,
  convertTransmissionToInvoice,
  createTransmission,
  getTransmission,
  listTransmissions,
} from "@/services/transmissions.service";
import { createStructure } from "@/services/acct-structures.service";
import { listInvoices } from "@/services/acct-invoices.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestFranchisee,
  createTestStore,
  createTestUser,
} from "../helpers/factories";

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

function pdfFile(name = "facture.pdf"): File {
  return new File([Buffer.from("%PDF-1.4 justificatif")], name, {
    type: "application/pdf",
  });
}

describe("transmissions comptables", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("création interne : PJ, historique initial, notification du pôle compta", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const animateur = asSession(
      await createTestUser({ role: "ANIMATION", pole: "ANIMATION" })
    );

    const transmission = await createTransmission(
      animateur,
      {
        type: "FACTURE",
        caseType: "FACTURE_INFLUENCEUR",
        subject: "Facture influenceur — campagne juillet",
        amount: "850.00",
      },
      [pdfFile()]
    );
    expect(transmission.status).toBe("EN_ATTENTE");
    expect(transmission.origin).toBe("INTERNE");

    const detail = await getTransmission(animateur, transmission.id);
    expect(detail?.attachments).toHaveLength(1);
    expect(detail?.events).toHaveLength(1);
    expect(detail?.events[0].newStatus).toBe("EN_ATTENTE");

    // La compta est notifiée automatiquement (cdc §2.2).
    const notifs = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, compta.id),
        eq(notifications.type, "COMPTABILITE")
      ),
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toContain("TR-");

    // La PJ est téléchargeable par la compta et l'émetteur, pas par un tiers.
    const attachment = detail!.attachments[0];
    expect((await canDownloadFile(compta, attachment)).allowed).toBe(true);
    expect((await canDownloadFile(animateur, attachment)).allowed).toBe(true);
    const tiers = asSession(
      await createTestUser({ role: "COMMUNICATION", pole: "COMMUNICATION" })
    );
    expect((await canDownloadFile(tiers, attachment)).allowed).toBe(false);
  });

  it("un franchisé ne transmet que pour SA boutique et ne voit que SES transmissions", async () => {
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const otherStore = await createTestStore();
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    // Boutique d'un autre : refus explicite.
    await expect(
      createTransmission(franchise, {
        type: "DEMANDE",
        caseType: "AUTRE",
        storeId: otherStore.id,
        subject: "Demande hors périmètre",
      })
    ).rejects.toThrow(ForbiddenError);
    // Sans boutique : refus aussi.
    await expect(
      createTransmission(franchise, {
        type: "DEMANDE",
        caseType: "AUTRE",
        subject: "Demande sans boutique",
      })
    ).rejects.toThrow(ForbiddenError);

    const own = await createTransmission(franchise, {
      type: "DEMANDE",
      caseType: "AUTRE",
      storeId: store.id,
      subject: "Demande de remboursement",
    });

    // Une transmission d'un autre émetteur est invisible du franchisé.
    const staff = asSession(
      await createTestUser({ role: "ANIMATION", pole: "ANIMATION" })
    );
    await createTransmission(staff, {
      type: "DEMANDE",
      caseType: "NOTE_DE_FRAIS",
      subject: "Note de frais visite",
    });

    const mine = await listTransmissions(franchise);
    expect(mine.map((t) => t.id)).toEqual([own.id]);
    await expect(getTransmission(franchise, mine[0].id)).resolves.toBeTruthy();

    const all = await listTransmissions(
      asSession(await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" }))
    );
    expect(all).toHaveLength(2);
  });

  it("traitement : statuts réservés à la compta, historique et notification émetteur", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const transmission = await createTransmission(rh, {
      type: "DEMANDE",
      caseType: "QUITTANCE",
      subject: "Quittance de loyer",
    });

    await expect(
      changeTransmissionStatus(rh, transmission.id, "VALIDEE")
    ).rejects.toThrow(ForbiddenError);

    await changeTransmissionStatus(
      compta,
      transmission.id,
      "REJETEE",
      "Justificatif illisible."
    );
    const detail = await getTransmission(compta, transmission.id);
    expect(detail?.status).toBe("REJETEE");
    expect(detail?.events[0].oldStatus).toBe("EN_ATTENTE");
    expect(detail?.events[0].newStatus).toBe("REJETEE");
    expect(detail?.events[0].comment).toContain("illisible");

    const notifs = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, rh.id),
        eq(notifications.type, "COMPTABILITE")
      ),
    });
    expect(notifs.some((n) => n.title.includes("rejetée"))).toBe(true);
  });

  it("conversion : transmission VALIDÉE → facture source TRANSMISSION, une seule fois", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const structure = await createStructure(compta, {
      code: "411INF",
      name: "Influenceurs",
      type: "PARTENAIRE",
    });
    const transmission = await createTransmission(compta, {
      type: "FACTURE",
      caseType: "FACTURE_INFLUENCEUR",
      structureId: structure.id,
      amount: "850.00",
      subject: "Facture influenceur",
    });

    const invoiceInput = {
      pieceNumber: "TRINF-1",
      pieceType: "FACTURE" as const,
      invoiceType: "STANDARD" as const,
      accountClass: "CHARGE" as const,
      pieceDate: "2026-07-20",
      structureId: structure.id,
      amountHT: "708.33",
      amountTTC: "850.00",
    };

    // En attente : conversion refusée tant que non validée.
    await expect(
      convertTransmissionToInvoice(compta, transmission.id, invoiceInput)
    ).rejects.toThrow(/validée/);

    await changeTransmissionStatus(compta, transmission.id, "VALIDEE");
    const invoice = await convertTransmissionToInvoice(
      compta,
      transmission.id,
      invoiceInput
    );
    expect(invoice.source).toBe("TRANSMISSION");
    expect(invoice.label).toContain("TR-");

    const detail = await getTransmission(compta, transmission.id);
    expect(detail?.status).toBe("TRAITEE");
    expect(detail?.invoiceId).toBe(invoice.id);

    const [journal] = await listInvoices(compta, { q: "TRINF-1" });
    expect(journal.amountVAT).toBe("141.67");

    // Une seconde conversion est bloquée.
    await expect(
      convertTransmissionToInvoice(compta, transmission.id, {
        ...invoiceInput,
        pieceNumber: "TRINF-2",
      })
    ).rejects.toThrow(/déjà/);
  });
});
