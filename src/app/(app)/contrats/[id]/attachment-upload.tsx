"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions/safe-action";

import { addContractAttachmentAction } from "../actions";

export function AttachmentUpload({ contractId }: { contractId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addContractAttachmentAction,
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
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <div className="space-y-1.5">
        <Label htmlFor="contract-file">Ajouter un document signé</Label>
        <Input id="contract-file" name="file" type="file" required className="w-72" />
      </div>
      <Button type="submit" disabled={pending} data-testid="contract-file-submit">
        {pending ? "Envoi…" : "Ajouter"}
      </Button>
    </form>
  );
}
