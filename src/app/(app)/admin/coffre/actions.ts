"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { ForbiddenError } from "@/lib/authz/guards";
import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createSecret,
  deleteSecret,
  revealSecret,
  updateSecret,
} from "@/services/vault.service";

const secretFields = z.object({
  label: z.string().trim().min(1, "Libellé requis"),
  username: z.string().trim().nullable(),
  url: z.string().trim().url("URL invalide").nullable(),
  notes: z.string().trim().nullable(),
});

function prepareSecret(formData: FormData) {
  return {
    label: formData.get("label"),
    username: nullable(formData.get("username")),
    url: nullable(formData.get("url")),
    notes: nullable(formData.get("notes")),
  };
}

export const createSecretAction = safeFormAction(
  {
    permission: "vault:write",
    schema: secretFields.extend({
      secret: z.string().min(1, "Le secret est obligatoire"),
    }),
    prepare: (formData) => ({
      ...prepareSecret(formData),
      secret: formData.get("secret"),
    }),
  },
  async (input, actor) => {
    await createSecret(actor, input);
    revalidatePath("/admin/coffre");
    return "Secret chiffré et enregistré.";
  }
);

export const updateSecretAction = safeFormAction(
  {
    permission: "vault:write",
    schema: secretFields.extend({
      secretId: z.string().uuid(),
      secret: z.string().nullable(),
    }),
    prepare: (formData) => ({
      ...prepareSecret(formData),
      secretId: formData.get("secretId"),
      secret: nullable(formData.get("secret")),
    }),
  },
  async (input, actor) => {
    const { secretId, ...fields } = input;
    await updateSecret(actor, secretId, fields);
    revalidatePath("/admin/coffre");
    return "Secret mis à jour.";
  }
);

export const deleteSecretAction = safeFormAction(
  {
    permission: "vault:write",
    schema: z.object({ secretId: z.string().uuid() }),
  },
  async (input, actor) => {
    await deleteSecret(actor, input.secretId);
    revalidatePath("/admin/coffre");
    return "Secret supprimé.";
  }
);

// Révélation unitaire — retourne le clair au composant (jamais dans un toast),
// journalisée REVEAL côté service.
export async function revealSecretAction(
  secretId: string
): Promise<{ value?: string; error?: string }> {
  const actor = await requireUser();
  try {
    const parsed = z.string().uuid().safeParse(secretId);
    if (!parsed.success) return { error: "Identifiant invalide." };
    return { value: await revealSecret(actor, parsed.data) };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    if (e instanceof Error) return { error: e.message };
    return { error: "Une erreur est survenue." };
  }
}
