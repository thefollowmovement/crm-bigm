"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  saveEmailSettings,
  saveEmailTemplate,
  sendTestEmail,
} from "@/services/email.service";

export const saveEmailSettingsAction = safeFormAction(
  {
    permission: "email:manage",
    schema: z.object({
      host: z.string().trim().min(1, "Hôte SMTP requis"),
      port: z.coerce.number().int("Port invalide").min(1).max(65535),
      secure: z.boolean(),
      username: z.string().trim().nullable(),
      password: z.string().nullable(),
      fromName: z.string().trim().min(1, "Nom d'expéditeur requis"),
      fromEmail: z.string().trim().email("Adresse d'expéditeur invalide"),
      headerHtml: z.string().nullable(),
      footerHtml: z.string().nullable(),
      signatureHtml: z.string().nullable(),
    }),
    prepare: (formData) => ({
      host: formData.get("host"),
      port: formData.get("port"),
      secure: formData.get("secure") === "true",
      username: nullable(formData.get("username")),
      password: nullable(formData.get("password")),
      fromName: formData.get("fromName"),
      fromEmail: formData.get("fromEmail"),
      headerHtml: nullable(formData.get("headerHtml")),
      footerHtml: nullable(formData.get("footerHtml")),
      signatureHtml: nullable(formData.get("signatureHtml")),
    }),
  },
  async (input, actor) => {
    await saveEmailSettings(actor, input);
    revalidatePath("/admin/emails");
    return "Paramètres e-mail enregistrés.";
  }
);

export const saveEmailTemplateAction = safeFormAction(
  {
    permission: "email:manage",
    schema: z.object({
      level: z.coerce.number().int().min(1).max(3),
      subject: z.string().trim().min(1, "Sujet requis"),
      bodyHtml: z.string().trim().min(1, "Corps du message requis"),
    }),
  },
  async (input, actor) => {
    await saveEmailTemplate(actor, input);
    revalidatePath("/admin/emails");
    return `Modèle de relance niveau ${input.level} enregistré.`;
  }
);

export const sendTestEmailAction = safeFormAction(
  {
    permission: "email:manage",
    schema: z.object({
      to: z.string().trim().email("Adresse de destination invalide"),
    }),
  },
  async (input, actor) => {
    await sendTestEmail(actor, input.to);
    return `E-mail de test envoyé à ${input.to} — vérifiez la réception.`;
  }
);
