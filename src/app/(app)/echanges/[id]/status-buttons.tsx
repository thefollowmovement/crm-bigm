"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/safe-action";

import { setStatusAction } from "../actions";

function StatusButton({
  exchangeId,
  status,
  label,
  variant = "outline",
}: {
  exchangeId: string;
  status: string;
  label: string;
  variant?: "outline" | "destructive";
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setStatusAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <input type="hidden" name="status" value={status} />
      <Button
        type="submit"
        variant={variant}
        size="sm"
        disabled={pending}
        data-testid={`status-button-${status}`}
      >
        {pending ? "…" : label}
      </Button>
    </form>
  );
}

// Boutons de changement de statut — rendus uniquement pour le siège.
export function StatusButtons({
  exchangeId,
  status,
}: {
  exchangeId: string;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "RESOLU" && status !== "CLOS" ? (
        <StatusButton
          exchangeId={exchangeId}
          status="RESOLU"
          label="Marquer résolu"
        />
      ) : null}
      {status !== "CLOS" ? (
        <StatusButton
          exchangeId={exchangeId}
          status="CLOS"
          label="Clore"
          variant="destructive"
        />
      ) : null}
      {status === "RESOLU" || status === "CLOS" ? (
        <StatusButton exchangeId={exchangeId} status="EN_COURS" label="Réouvrir" />
      ) : null}
    </div>
  );
}
