"use client";

import { useActionState, useEffect } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/safe-action";

import { setArchivedAction } from "../actions";

export function ArchiveButton({
  documentId,
  isArchived,
}: {
  documentId: string;
  isArchived: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setArchivedAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="isArchived" value={isArchived ? "false" : "true"} />
      <Button type="submit" variant="outline" disabled={pending}>
        {isArchived ? <ArchiveRestore /> : <Archive />}
        {isArchived ? "Restaurer" : "Archiver"}
      </Button>
    </form>
  );
}
