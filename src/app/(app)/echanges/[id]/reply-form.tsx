"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions/safe-action";

import { addMessageAction } from "../actions";

// Formulaire de réponse. Les cases « Décision » et « Note interne » ne sont
// rendues que pour le siège (showSiegeOptions) — et le service force de toute
// façon ces indicateurs à false pour un franchisé.
export function ReplyForm({
  exchangeId,
  showSiegeOptions,
}: {
  exchangeId: string;
  showSiegeOptions: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addMessageAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <div className="space-y-1.5">
        <Label htmlFor="reply-body">Répondre</Label>
        <Textarea
          id="reply-body"
          name="body"
          rows={4}
          required
          data-testid="reply-body"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reply-files">Pièces jointes</Label>
        <Input id="reply-files" name="files" type="file" multiple className="w-72" />
      </div>
      {showSiegeOptions ? (
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isDecision" data-testid="decision-checkbox" />
            Décision
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isInternal" data-testid="internal-note-checkbox" />
            Note interne (invisible pour le franchisé)
          </label>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} data-testid="reply-submit">
        {pending ? "Envoi…" : "Envoyer"}
      </Button>
    </form>
  );
}
