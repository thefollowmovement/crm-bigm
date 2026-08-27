import "server-only";

import nodemailer from "nodemailer";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { emailSettings, emailTemplates } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import {
  buildEmailHtml,
  renderTemplate,
  type TemplateVariables,
} from "@/lib/email/render";
import { decryptSecret, encryptSecret } from "@/lib/vault/crypto";

// Paramètres SMTP + modèles d'e-mails de relance (étape 43). Le mot de passe
// SMTP est chiffré avec VAULT_KEY (comme le coffre-fort) et jamais renvoyé
// aux composants : l'UI sait seulement s'il est défini.

// ── Paramètres SMTP ──────────────────────────────────────────────

export type EmailSettingsInput = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  // null/vide = conserver le mot de passe déjà enregistré
  password: string | null;
  fromName: string;
  fromEmail: string;
  headerHtml: string | null;
  footerHtml: string | null;
  signatureHtml: string | null;
};

export async function getEmailSettings(actor: SessionUser) {
  assertCan(actor, "email:manage");
  const row = await db.query.emailSettings.findFirst();
  if (!row) return null;
  // Jamais le ciphertext vers l'UI — seulement « défini ou non ».
  const { passwordEncrypted, ...rest } = row;
  return { ...rest, hasPassword: passwordEncrypted !== null };
}

export async function saveEmailSettings(
  actor: SessionUser,
  input: EmailSettingsInput
) {
  assertCan(actor, "email:manage");
  if (!input.host.trim()) throw new Error("L'hôte SMTP est obligatoire.");
  if (!input.fromEmail.trim()) {
    throw new Error("L'adresse d'expéditeur est obligatoire.");
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("Port SMTP invalide.");
  }

  const existing = await db.query.emailSettings.findFirst();
  const values = {
    host: input.host.trim(),
    port: input.port,
    secure: input.secure,
    username: input.username,
    fromName: input.fromName.trim() || "CRM Big M",
    fromEmail: input.fromEmail.trim(),
    headerHtml: input.headerHtml,
    footerHtml: input.footerHtml,
    signatureHtml: input.signatureHtml,
  };
  if (existing) {
    return auditedUpdate({ id: actor.id }, emailSettings, existing.id, {
      ...values,
      ...(input.password
        ? { passwordEncrypted: encryptSecret(input.password) }
        : {}),
    });
  }
  return auditedInsert({ id: actor.id }, emailSettings, {
    ...values,
    passwordEncrypted: input.password ? encryptSecret(input.password) : null,
  });
}

// ── Modèles de relance ───────────────────────────────────────────

export async function listEmailTemplates(actor: SessionUser) {
  assertCan(actor, "email:manage");
  return db.query.emailTemplates.findMany({
    orderBy: [asc(emailTemplates.level)],
  });
}

export async function saveEmailTemplate(
  actor: SessionUser,
  input: { level: number; subject: string; bodyHtml: string }
) {
  assertCan(actor, "email:manage");
  if (![1, 2, 3].includes(input.level)) {
    throw new Error("Niveau de relance invalide (1, 2 ou 3).");
  }
  if (!input.subject.trim()) throw new Error("Le sujet est obligatoire.");
  if (!input.bodyHtml.trim()) throw new Error("Le corps du message est obligatoire.");

  const existing = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.level, input.level),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, emailTemplates, existing.id, {
      subject: input.subject,
      bodyHtml: input.bodyHtml,
    });
  }
  return auditedInsert({ id: actor.id }, emailTemplates, input);
}

// ── Envoi ────────────────────────────────────────────────────────

// Lecture interne (sans permission) pour l'envoi : relances (finance:write)
// et test SMTP passent par ici.
async function loadSmtpOrThrow() {
  const settings = await db.query.emailSettings.findFirst();
  if (!settings) {
    throw new Error(
      "Paramètres SMTP non configurés : renseignez-les dans Administration → E-mails."
    );
  }
  return settings;
}

type SmtpRow = typeof emailSettings.$inferSelect;

function buildTransport(settings: SmtpRow) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username
      ? {
          user: settings.username,
          pass: settings.passwordEncrypted
            ? decryptSecret(settings.passwordEncrypted)
            : "",
        }
      : undefined,
    // un envoi ne doit pas bloquer une action utilisateur trop longtemps
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

async function deliver(
  settings: SmtpRow,
  message: { to: string; subject: string; bodyHtml: string }
) {
  const transport = buildTransport(settings);
  const html = buildEmailHtml({
    headerHtml: settings.headerHtml,
    bodyHtml: message.bodyHtml,
    signatureHtml: settings.signatureHtml,
    footerHtml: settings.footerHtml,
  });
  try {
    await transport.sendMail({
      from: `"${settings.fromName.replaceAll('"', "'")}" <${settings.fromEmail}>`,
      to: message.to,
      subject: message.subject,
      html,
    });
  } catch (e) {
    throw new Error(
      `Envoi impossible (${settings.host}:${settings.port}) : ${
        e instanceof Error ? e.message : "erreur SMTP"
      }`
    );
  } finally {
    transport.close();
  }
}

// Envoi (optionnel) du lien d'invitation à un contact externe (étape 49).
// Nécessite les paramètres SMTP ; l'appelant décide quoi faire d'un échec
// (le lien reste copiable à la main dans tous les cas).
export async function sendTransmissionInviteEmail(input: {
  to: string;
  url: string;
  expiresAt: Date;
}) {
  const settings = await loadSmtpOrThrow();
  const expires = input.expiresAt.toLocaleDateString("fr-FR");
  await deliver(settings, {
    to: input.to,
    subject: "Lien sécurisé pour transmettre vos documents",
    bodyHtml:
      `<p>Bonjour,</p>` +
      `<p>Vous pouvez nous transmettre votre document (facture, justificatif…) ` +
      `via ce lien sécurisé, utilisable une seule fois :</p>` +
      `<p><a href="${input.url}">${input.url}</a></p>` +
      `<p>Ce lien expire le ${expires}.</p>`,
  });
}

export async function sendTestEmail(actor: SessionUser, to: string) {
  assertCan(actor, "email:manage");
  if (!to.includes("@")) throw new Error("Adresse de destination invalide.");
  const settings = await loadSmtpOrThrow();
  await deliver(settings, {
    to,
    subject: "Test SMTP — CRM Big M",
    bodyHtml:
      "<p>Ceci est un e-mail de test envoyé depuis le CRM Big M. " +
      "Si vous le recevez, vos paramètres SMTP fonctionnent.</p>",
  });
  return { to };
}

// Envoi d'une relance : rend le modèle du niveau avec les variables de la
// facture, puis envoie. Appelé par le service factures AVANT d'enregistrer
// la relance (pas d'envoi → pas de trace).
export async function sendReminderEmail(input: {
  level: number;
  to: string;
  variables: TemplateVariables;
}) {
  const settings = await loadSmtpOrThrow();
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.level, input.level),
  });
  if (!template) {
    throw new Error(
      `Aucun modèle d'e-mail pour la relance niveau ${input.level} : créez-le dans Administration → E-mails.`
    );
  }
  await deliver(settings, {
    to: input.to,
    subject: renderTemplate(template.subject, input.variables),
    bodyHtml: renderTemplate(template.bodyHtml, input.variables, {
      escapeValues: true,
    }),
  });
  return { to: input.to };
}
