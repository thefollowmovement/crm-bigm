"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { nullable, type ActionState } from "@/lib/actions/safe-action";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { submitExternalTransmission } from "@/services/transmission-invites.service";

const schema = z.object({
  token: z.string().min(20).max(64),
  externalName: z.string().trim().min(2, "Indiquez votre nom."),
  type: z.enum(["DEMANDE", "FACTURE"]),
  caseType: z.enum([
    "FACTURE_INFLUENCEUR",
    "FACTURE_FOURNISSEUR",
    "QUITTANCE",
    "AUTRE",
  ]),
  subject: z.string().trim().min(1, "Indiquez l'objet de votre envoi."),
  amount: z
    .string()
    .trim()
    .regex(/^-?\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
    .transform((v) => v.replace(",", "."))
    .nullable(),
  message: z.string().trim().max(4000).nullable(),
});

// Action PUBLIQUE (aucune session) : jeton à usage unique + limitation de
// débit par IP + validation stricte — cdc §2.2.
export async function submitExternalAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`tr-submit:${ip}`, { limit: 5, windowMs: 10 * 60 * 1000 })) {
    return {
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    };
  }
  const parsed = schema.safeParse({
    token: formData.get("token"),
    externalName: formData.get("externalName"),
    type: formData.get("type"),
    caseType: formData.get("caseType"),
    subject: formData.get("subject"),
    amount: nullable(formData.get("amount")),
    message: nullable(formData.get("message")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "Joignez au moins un document (PDF ou image)." };
  }
  try {
    const { token, ...input } = parsed.data;
    await submitExternalTransmission(token, input, files, ip);
    return { success: "Transmission envoyée. La comptabilité a été notifiée." };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Une erreur est survenue.",
    };
  }
}
