"use client";

import { useActionState } from "react";
import { Check, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/safe-action";

import { markAllAsReadAction, markAsReadAction } from "./actions";

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [, formAction, pending] = useActionState<ActionState, FormData>(
    markAsReadAction,
    {}
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="notificationId" value={notificationId} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title="Marquer comme lue"
      >
        <Check />
      </Button>
    </form>
  );
}

export function MarkAllReadButton() {
  const [, formAction, pending] = useActionState<ActionState, FormData>(
    markAllAsReadAction,
    {}
  );
  return (
    <form action={formAction}>
      <Button variant="outline" type="submit" disabled={pending}>
        <CheckCheck /> Tout marquer lu
      </Button>
    </form>
  );
}
