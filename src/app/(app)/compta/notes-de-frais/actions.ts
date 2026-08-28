"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeFormAction } from "@/lib/actions/safe-action";
import { markClaimReimbursed } from "@/services/expense-claims.service";

// Remboursement d'une note de frais validée (étape 54).
export const markClaimReimbursedAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({ claimId: z.string().uuid() }),
  },
  async (input, actor) => {
    const claim = await markClaimReimbursed(actor, input.claimId);
    revalidatePath("/compta/notes-de-frais");
    return `Note « ${claim.title} » marquée remboursée.`;
  }
);
