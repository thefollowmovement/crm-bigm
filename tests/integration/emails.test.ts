import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import { decryptSecret } from "@/lib/vault/crypto";
import {
  getEmailSettings,
  listEmailTemplates,
  saveEmailSettings,
  saveEmailTemplate,
} from "@/services/email.service";
import { sendInvoiceReminder } from "@/services/acct-invoices.service";
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
}): SessionUser {
  return { ...user };
}

beforeAll(() => {
  process.env.VAULT_KEY = Buffer.from(
    "test-key-32-bytes-pour-le-coffre"
  ).toString("base64");
});

afterAll(async () => {
  await pool.end();
});

const SETTINGS = {
  host: "smtp.test.fr",
  port: 587,
  secure: false,
  username: "crm@test.fr",
  password: "secret-smtp",
  fromName: "Big M CIE",
  fromEmail: "crm@test.fr",
  headerHtml: null,
  footerHtml: null,
  signatureHtml: null,
};

describe("e-mails : paramètres SMTP et modèles", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("mot de passe chiffré, jamais renvoyé à l'UI, conservé si laissé vide", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));

    await saveEmailSettings(direction, SETTINGS);

    // L'UI reçoit hasPassword, jamais le ciphertext.
    const forUi = await getEmailSettings(direction);
    expect(forUi?.hasPassword).toBe(true);
    expect(forUi).not.toHaveProperty("passwordEncrypted");

    // En base : format coffre-fort v1:… et déchiffrement exact.
    const raw = await db.query.emailSettings.findFirst();
    expect(raw!.passwordEncrypted).toMatch(/^v1:/);
    expect(decryptSecret(raw!.passwordEncrypted!)).toBe("secret-smtp");

    // Nouvel enregistrement sans mot de passe : conservé ; hôte mis à jour.
    await saveEmailSettings(direction, {
      ...SETTINGS,
      host: "smtp2.test.fr",
      password: null,
    });
    const updated = await db.query.emailSettings.findFirst();
    expect(updated!.host).toBe("smtp2.test.fr");
    expect(decryptSecret(updated!.passwordEncrypted!)).toBe("secret-smtp");

    // Hors direction : interdit.
    await expect(getEmailSettings(compta)).rejects.toThrow(ForbiddenError);
    await expect(saveEmailSettings(compta, SETTINGS)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("modèles de relance : un par niveau, remplacé à la re-sauvegarde", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));

    await saveEmailTemplate(direction, {
      level: 1,
      subject: "Rappel {{facture_numero}}",
      bodyHtml: "<p>Bonjour {{contact_prenom}}</p>",
    });
    await saveEmailTemplate(direction, {
      level: 1,
      subject: "Rappel modifié",
      bodyHtml: "<p>Nouveau corps</p>",
    });

    const templates = await listEmailTemplates(direction);
    expect(templates).toHaveLength(1);
    expect(templates[0].subject).toBe("Rappel modifié");

    await expect(
      saveEmailTemplate(direction, { level: 4, subject: "x", bodyHtml: "y" })
    ).rejects.toThrow(/Niveau/);
  });

  // Étape 52 : relance d'une pièce du journal comptable — l'envoi précède la
  // trace (échec SMTP → lastReminder* jamais posés).
  it("relance du journal : erreurs claires et AUCUNE trace si l'e-mail ne part pas", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));

    // Structure sans adresse e-mail.
    const orphan = await createTestAcctStructure({ email: null });
    const pieceOrphan = await createTestAcctInvoice(orphan.id, {
      status: "EN_RETARD",
    });
    await expect(
      sendInvoiceReminder(compta, pieceOrphan.id, 1)
    ).rejects.toThrow(/adresse e-mail/);

    // Structure avec e-mail mais SMTP non configuré.
    const structure = await createTestAcctStructure({ email: "farid@test.fr" });
    const piece = await createTestAcctInvoice(structure.id, {
      status: "EN_RETARD",
    });
    await expect(sendInvoiceReminder(compta, piece.id, 1)).rejects.toThrow(
      /Paramètres SMTP non configurés/
    );

    // Envoi impossible → aucune trace posée sur la pièce.
    const after = await db.query.acctInvoices.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.id, piece.id),
    });
    expect(after!.lastReminderLevel).toBeNull();
    expect(after!.lastReminderAt).toBeNull();

    // Une pièce soldée n'est pas relançable.
    const paid = await createTestAcctInvoice(structure.id, { status: "PAYEE" });
    await expect(sendInvoiceReminder(compta, paid.id, 1)).rejects.toThrow(
      /non soldée/
    );
  });
});
