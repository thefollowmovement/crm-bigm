"use client";

import { useActionState, useEffect } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions/safe-action";

import { postComptaMessageAction } from "./actions";

// Réponse de la compta dans le fil de discussion d'une pièce (étape 53).
export function ComptaMessageForm({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    postComptaMessageAction,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Textarea
        name="body"
        rows={2}
        required
        placeholder="Répondre au prestataire…"
        className="flex-1"
        data-testid="compta-message-input"
      />
      <Button type="submit" disabled={pending} data-testid="compta-message-send">
        <Send /> {pending ? "…" : "Envoyer"}
      </Button>
    </form>
  );
}
