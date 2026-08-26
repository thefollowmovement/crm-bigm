"use client";

import { useActionState, useEffect } from "react";
import { DatabaseBackup, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/safe-action";

import { deleteBackupAction, runBackupAction } from "./actions";

function useToasted(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

export function RunBackupButton() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    runBackupAction,
    {}
  );
  useToasted(state);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending} data-testid="run-backup-button">
        <DatabaseBackup />
        {pending ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
      </Button>
    </form>
  );
}

export function DeleteBackupButton({ backupId }: { backupId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteBackupAction,
    {}
  );
  useToasted(state);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="backupId" value={backupId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={pending}
        title="Supprimer cette sauvegarde"
        data-testid={`delete-backup-${backupId}`}
      >
        <Trash2 />
      </Button>
    </form>
  );
}
