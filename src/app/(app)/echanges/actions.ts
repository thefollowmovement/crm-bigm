"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeFormAction } from "@/lib/actions/safe-action";
import {
  addMessage,
  createExchange,
  setExchangeStatus,
} from "@/services/exchanges.service";

// ⚠️ Piège Next : jamais d'arrow inline dans z.custom() au sein d'un export
// de fichier "use server" — le prédicat est hissé en const module.
const isNonEmptyFile = (v: unknown) => v instanceof File && v.size > 0;
const fileSchema = z.custom<File>(isNonEmptyFile, "Fichier invalide");

// Récupère les PJ multiples d'un champ <input type="file" multiple> :
// un input vide envoie un File de taille 0, à ignorer.
function extractFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((v): v is File => v instanceof File && v.size > 0);
}

const createExchangeSchema = z.object({
  storeId: z.string().uuid("Boutique invalide"),
  type: z.enum(["DEMANDE", "LITIGE", "DECISION", "INFORMATION"]),
  subject: z.string().trim().min(1, "Le sujet est obligatoire"),
  body: z.string().trim().min(1, "Le message est obligatoire"),
  files: z.array(fileSchema),
});

export const createExchangeAction = safeFormAction(
  {
    permission: "exchange:write",
    schema: createExchangeSchema,
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      type: formData.get("type"),
      subject: formData.get("subject"),
      body: formData.get("body"),
      files: extractFiles(formData),
    }),
  },
  async (input, actor) => {
    await createExchange(actor, input);
    revalidatePath("/echanges");
    return "Échange créé.";
  }
);

const addMessageSchema = z.object({
  exchangeId: z.string().uuid(),
  body: z.string().trim().min(1, "Le message est obligatoire"),
  isDecision: z.boolean(),
  isInternal: z.boolean(),
  files: z.array(fileSchema),
});

export const addMessageAction = safeFormAction(
  {
    permission: "exchange:write",
    schema: addMessageSchema,
    prepare: (formData) => ({
      exchangeId: formData.get("exchangeId"),
      body: formData.get("body"),
      isDecision: formData.get("isDecision") === "on",
      isInternal: formData.get("isInternal") === "on",
      files: extractFiles(formData),
    }),
  },
  async ({ exchangeId, ...input }, actor) => {
    await addMessage(actor, exchangeId, input);
    revalidatePath(`/echanges/${exchangeId}`);
    revalidatePath("/echanges");
    return "Message envoyé.";
  }
);

const setStatusSchema = z.object({
  exchangeId: z.string().uuid(),
  status: z.enum(["OUVERT", "EN_COURS", "RESOLU", "CLOS"]),
});

export const setStatusAction = safeFormAction(
  {
    permission: "exchange:write",
    schema: setStatusSchema,
    prepare: (formData) => ({
      exchangeId: formData.get("exchangeId"),
      status: formData.get("status"),
    }),
  },
  async ({ exchangeId, status }, actor) => {
    await setExchangeStatus(actor, exchangeId, status);
    revalidatePath(`/echanges/${exchangeId}`);
    revalidatePath("/echanges");
    return "Statut mis à jour.";
  }
);
