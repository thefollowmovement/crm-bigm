"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { createAgent, updateAgent } from "@/services/prospects.service";

// Hissé en const module : pas d'arrow inline dans un schéma exporté.
const boolString = z.enum(["true", "false"]).transform((v) => v === "true");

const agentFields = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  agency: z.string().trim().nullable(),
  email: z.string().email("E-mail invalide").nullable(),
  phone: z.string().nullable(),
  zone: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
});

function prepareAgent(formData: FormData) {
  return {
    name: formData.get("name"),
    agency: nullable(formData.get("agency")),
    email: nullable(formData.get("email")),
    phone: nullable(formData.get("phone")),
    zone: nullable(formData.get("zone")),
    notes: nullable(formData.get("notes")),
  };
}

export const createAgentAction = safeFormAction(
  {
    permission: "development:write",
    schema: agentFields,
    prepare: prepareAgent,
  },
  async (input, actor) => {
    await createAgent(actor, input);
    revalidatePath("/developpement/agents");
    return "Agent créé.";
  }
);

export const updateAgentAction = safeFormAction(
  {
    permission: "development:write",
    schema: agentFields.extend({
      agentId: z.string().uuid(),
      isActive: boolString,
    }),
    prepare: (formData) => ({
      ...prepareAgent(formData),
      agentId: formData.get("agentId"),
      isActive: formData.get("isActive") ?? "true",
    }),
  },
  async (input, actor) => {
    const { agentId, ...fields } = input;
    await updateAgent(actor, agentId, fields);
    revalidatePath("/developpement/agents");
    return "Agent mis à jour.";
  }
);
