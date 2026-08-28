import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createProviderAccount,
  createProviderTicket,
  createProviderTransmission,
  listInvoiceMessages,
  listProviderInvoices,
  listProviderTickets,
  listProviderTransmissions,
  postInvoiceMessage,
} from "@/services/providers.service";
import { getTicket, listTickets } from "@/services/tickets.service";
import { listTransmissions } from "@/services/transmissions.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestAcctInvoice,
  createTestAcctStructure,
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
  acctStructureId?: string | null;
}): SessionUser {
  return { ...user };
}

afterAll(async () => {
  await pool.end();
});

describe("espace prestataires (étape 53)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("compte prestataire : créé par user:manage, rôle forcé, rattaché à la structure", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const structure = await createTestAcctStructure();

    await expect(
      createProviderAccount(compta, structure.id, {
        email: "p@ext.fr",
        password: "MotDePasse!42",
        firstName: "Paula",
        lastName: "Prestataire",
      })
    ).rejects.toThrow(ForbiddenError);

    const account = await createProviderAccount(admin, structure.id, {
      email: "p@ext.fr",
      password: "MotDePasse!42",
      firstName: "Paula",
      lastName: "Prestataire",
    });
    expect(account.role).toBe("PRESTATAIRE");
    expect(account.acctStructureId).toBe(structure.id);
  });

  it("factures : scopées à SA structure, sans les notes internes", async () => {
    const structure = await createTestAcctStructure();
    const otherStructure = await createTestAcctStructure();
    await createTestAcctInvoice(structure.id, {
      pieceNumber: "FA-MINE",
      notes: "note interne compta",
    });
    await createTestAcctInvoice(otherStructure.id, { pieceNumber: "FA-OTHER" });

    const provider = asSession(
      await createTestUser({ role: "PRESTATAIRE", acctStructureId: structure.id })
    );
    const rows = await listProviderInvoices(provider);
    expect(rows.map((r) => r.pieceNumber)).toEqual(["FA-MINE"]);
    // Champ interne jamais présent dans le DTO prestataire.
    expect(rows[0]).not.toHaveProperty("notes");

    // Sans structure rattachée : accès refusé.
    const detached = asSession(
      await createTestUser({ role: "PRESTATAIRE", acctStructureId: null })
    );
    await expect(listProviderInvoices(detached)).rejects.toThrow(ForbiddenError);
  });

  it("discussion : prestataire ↔ compta avec notifications croisées, tiers exclu", async () => {
    const structure = await createTestAcctStructure();
    const invoice = await createTestAcctInvoice(structure.id);
    const provider = asSession(
      await createTestUser({ role: "PRESTATAIRE", acctStructureId: structure.id })
    );
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );

    await postInvoiceMessage(provider, invoice.id, "Où en est le paiement ?");
    // La compta est notifiée…
    const comptaNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, compta.id),
    });
    expect(comptaNotifs).toHaveLength(1);
    expect(comptaNotifs[0].link).toContain(`/compta/factures/${invoice.id}`);

    // …répond, et le prestataire est notifié en retour.
    await postInvoiceMessage(compta, invoice.id, "Virement parti hier.");
    const providerNotifs = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, provider.id)),
    });
    expect(providerNotifs).toHaveLength(1);
    expect(providerNotifs[0].link).toContain(`/prestataire/factures/${invoice.id}`);

    const thread = await listInvoiceMessages(provider, invoice.id);
    expect(thread.map((m) => m.body)).toEqual([
      "Où en est le paiement ?",
      "Virement parti hier.",
    ]);

    // Un prestataire d'une AUTRE structure ne voit pas le fil.
    const foreign = asSession(
      await createTestUser({
        role: "PRESTATAIRE",
        acctStructureId: (await createTestAcctStructure()).id,
      })
    );
    await expect(listInvoiceMessages(foreign, invoice.id)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("dépôt : transmission vers la compta, structure forcée, visible des deux côtés", async () => {
    const structure = await createTestAcctStructure();
    const provider = asSession(
      await createTestUser({ role: "PRESTATAIRE", acctStructureId: structure.id })
    );
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );

    const transmission = await createProviderTransmission(provider, {
      type: "FACTURE",
      caseType: "NOTE_DE_FRAIS",
      subject: "Note de frais août",
      amount: "120.50",
    });
    expect(transmission.structureId).toBe(structure.id);
    expect(transmission.targetPole).toBe("COMPTABILITE");

    const mine = await listProviderTransmissions(provider);
    expect(mine.map((t) => t.subject)).toEqual(["Note de frais août"]);

    // Côté compta : la transmission arrive dans la file habituelle + notif.
    const forCompta = await listTransmissions(compta);
    expect(forCompta.map((t) => t.subject)).toContain("Note de frais août");
    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, compta.id),
    });
    expect(notifs.some((n) => n.title.includes("Dépôt prestataire"))).toBe(true);
  });

  it("ticket : toujours vers la compta, le prestataire ne voit que les siens", async () => {
    const structure = await createTestAcctStructure();
    const provider = asSession(
      await createTestUser({ role: "PRESTATAIRE", acctStructureId: structure.id })
    );
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );

    const ticket = await createProviderTicket(provider, {
      title: "Justificatif manquant",
      description: "Il me manque l'avis de virement de juillet.",
    });
    expect(ticket.toPole).toBe("COMPTABILITE");

    const mine = await listProviderTickets(provider);
    expect(mine.map((t) => t.title)).toEqual(["Justificatif manquant"]);

    // Le détail est lisible par son auteur (règle « je suis concerné »).
    const detail = await getTicket(provider, ticket.id);
    expect(detail?.title).toBe("Justificatif manquant");

    // Et par la compta dans sa file de pôle.
    const forCompta = await listTickets(compta, { view: "pole" });
    expect(forCompta.map((t) => t.title)).toContain("Justificatif manquant");
  });
});
