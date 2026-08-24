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
import { addReminder } from "@/services/invoices.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestFranchisee,
  createTestInvoice,
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

  it("relance avec envoi : erreurs claires et AUCUNE trace si l'e-mail ne part pas", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));

    // Boutique sans franchisé (donc sans adresse e-mail).
    const orphan = await createTestStore();
    const invoiceOrphan = await createTestInvoice(orphan.id, {
      dueDate: "2026-09-15",
    });
    await expect(
      addReminder(compta, invoiceOrphan.id, {
        level: 1,
        channel: "EMAIL",
        sentAt: "2026-09-20",
        notes: null,
        sendEmail: true,
      })
    ).rejects.toThrow(/adresse e-mail/);

    // Franchisé avec e-mail mais SMTP non configuré.
    const franchisee = await createTestFranchisee({ email: "farid@test.fr" });
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const invoice = await createTestInvoice(store.id, { dueDate: "2026-09-15" });
    await expect(
      addReminder(compta, invoice.id, {
        level: 1,
        channel: "EMAIL",
        sentAt: "2026-09-20",
        notes: null,
        sendEmail: true,
      })
    ).rejects.toThrow(/Paramètres SMTP non configurés/);

    // Envoi impossible → aucune relance enregistrée.
    expect(await db.query.reminders.findMany()).toHaveLength(0);

    // Sans envoi automatique : la relance se crée normalement, sans trace e-mail.
    const reminder = await addReminder(compta, invoice.id, {
      level: 1,
      channel: "EMAIL",
      sentAt: "2026-09-20",
      notes: null,
      sendEmail: false,
    });
    expect(reminder.emailSentTo).toBeNull();
    expect(await db.query.reminders.findMany()).toHaveLength(1);
  });
});
