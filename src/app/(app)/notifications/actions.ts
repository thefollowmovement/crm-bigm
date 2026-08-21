"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeFormAction } from "@/lib/actions/safe-action";
import { markAllAsRead, markAsRead } from "@/services/notifications.service";

export const markAsReadAction = safeFormAction(
  { schema: z.object({ notificationId: z.string().uuid() }) },
  async ({ notificationId }, actor) => {
    await markAsRead(actor, notificationId);
    revalidatePath("/notifications");
    return "Notification lue.";
  }
);

export const markAllAsReadAction = safeFormAction(
  { schema: z.object({}) },
  async (_input, actor) => {
    await markAllAsRead(actor);
    revalidatePath("/notifications");
    return "Toutes les notifications sont marquées lues.";
  }
);
