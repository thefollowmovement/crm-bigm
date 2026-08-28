"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/safe-action";

import { markClaimReimbursedAction } from "./actions";

export function ReimburseButton({ claimId }: { claimId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    markClaimReimbursedAction,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
  return (
    <form action={formAction}>
      <input type="hidden" name="claimId" value={claimId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        data-testid={`reimburse-${claimId}`}
      >
        {pending ? "…" : "Marquer remboursée"}
      </Button>
    </form>
  );
}
