"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createSoftware,
  setSoftwareUsers,
  updateSoftware,
} from "@/services/software.service";

// Hissé en const module : pas d'arrow inline dans un schéma exporté.
const boolString = z.enum(["true", "false"]).transform((v) => v === "true");

const softwareFields = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  purpose: z.string().trim().nullable(),
  url: z.string().trim().url("URL invalide").nullable(),
  ownerId: z.string().uuid().nullable(),
  accessLevelNotes: z.string().trim().nullable(),
});

function prepareSoftware(formData: FormData) {
  return {
    name: formData.get("name"),
    purpose: nullable(formData.get("purpose")),
    url: nullable(formData.get("url")),
    ownerId: nullable(formData.get("ownerId")),
    accessLevelNotes: nullable(formData.get("accessLevelNotes")),
  };
}

export const createSoftwareAction = safeFormAction(
  {
    permission: "software:write",
    schema: softwareFields,
    prepare: prepareSoftware,
  },
  async (input, actor) => {
    await createSoftware(actor, input);
    revalidatePath("/admin/logiciels");
    return "Logiciel ajouté au registre.";
  }
);

export const updateSoftwareAction = safeFormAction(
  {
    permission: "software:write",
    schema: softwareFields.extend({
      softwareId: z.string().uuid(),
      isActive: boolString,
    }),
    prepare: (formData) => ({
      ...prepareSoftware(formData),
      softwareId: formData.get("softwareId"),
      isActive: formData.get("isActive") ?? "true",
    }),
  },
  async (input, actor) => {
    const { softwareId, ...fields } = input;
    await updateSoftware(actor, softwareId, fields);
    revalidatePath("/admin/logiciels");
    return "Logiciel mis à jour.";
  }
);

export const setSoftwareUsersAction = safeFormAction(
  {
    permission: "software:write",
    schema: z.object({
      softwareId: z.string().uuid(),
      userIds: z.array(z.string().uuid()),
    }),
    prepare: (formData) => ({
      softwareId: formData.get("softwareId"),
      userIds: formData.getAll("userIds").filter((v) => typeof v === "string"),
    }),
  },
  async (input, actor) => {
    await setSoftwareUsers(actor, input.softwareId, input.userIds);
    revalidatePath("/admin/logiciels");
    return "Utilisateurs autorisés mis à jour.";
  }
);
