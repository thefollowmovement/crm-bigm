"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { clock } from "@/services/timeclock.service";
import { cancelLeave, requestLeave } from "@/services/leaves.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

const CLOCK_MESSAGES = {
  DEBUT: "Journée démarrée. Bon service !",
  PAUSE: "Pause démarrée.",
  REPRISE: "Reprise du travail.",
  FIN: "Journée terminée.",
} as const;

export const clockAction = safeFormAction(
  {
    permission: "self:clock",
    schema: z.object({ action: z.enum(["DEBUT", "PAUSE", "REPRISE", "FIN"]) }),
  },
  async (input, actor) => {
    await clock(actor, input.action);
    revalidatePath("/mon-espace");
    return CLOCK_MESSAGES[input.action];
  }
);

export const requestMyLeaveAction = safeFormAction(
  {
    permission: "self:leave",
    schema: z.object({
      type: z.enum(["CONGES_PAYES", "SANS_SOLDE", "MALADIE", "FAMILIAL", "AUTRE"]),
      startDate: dateString,
      endDate: dateString,
      comment: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      type: formData.get("type"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      comment: nullable(formData.get("comment")),
    }),
  },
  async (input, actor) => {
    await requestLeave(actor, { ...input, employeeId: null });
    revalidatePath("/mon-espace");
    return "Demande de congés envoyée à la RH.";
  }
);

export const cancelMyLeaveAction = safeFormAction(
  {
    permission: "self:leave",
    schema: z.object({ leaveId: z.string().uuid() }),
  },
  async (input, actor) => {
    await cancelLeave(actor, input.leaveId);
    revalidatePath("/mon-espace");
    return "Demande annulée.";
  }
);
