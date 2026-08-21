"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createSecretAction,
  deleteSecretAction,
  revealSecretAction,
} from "./actions";

function useToasted(state: ActionState, onSuccess?: () => void) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function CreateSecretDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSecretAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-secret-button">
          <Plus /> Nouveau secret
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Secret du coffre-fort</DialogTitle>
          <DialogDescription>
            Chiffré AES-256-GCM avant stockage — chaque révélation est
            journalisée.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vs-label">Libellé</Label>
              <Input
                id="vs-label"
                name="label"
                required
                placeholder="Compte bancaire pro…"
                data-testid="secret-label-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vs-username">Identifiant</Label>
              <Input id="vs-username" name="username" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="vs-url">URL</Label>
              <Input id="vs-url" name="url" placeholder="https://…" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="vs-secret">Secret (mot de passe, clé…)</Label>
              <Input
                id="vs-secret"
                name="secret"
                type="password"
                required
                data-testid="secret-value-input"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vs-notes">Notes</Label>
            <Textarea id="vs-notes" name="notes" rows={2} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="secret-submit"
          >
            {pending ? "Chiffrement…" : "Chiffrer et enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Révélation à l'unité : le clair n'apparaît qu'après clic, jamais en masse.
export function RevealSecretButton({ secretId }: { secretId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    startTransition(async () => {
      const result = await revealSecretAction(secretId);
      if (result.error) toast.error(result.error);
      else setValue(result.value ?? null);
    });
  }

  if (value !== null) {
    return (
      <span className="flex items-center gap-2">
        <code className="rounded bg-muted px-2 py-0.5 text-sm" data-testid="secret-value">
          {value}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setValue(null)}
          aria-label="Masquer le secret"
        >
          <EyeOff />
        </Button>
      </span>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={reveal}
      disabled={pending}
      data-testid="secret-reveal"
    >
      <Eye /> {pending ? "Déchiffrement…" : "Révéler"}
    </Button>
  );
}

export function DeleteSecretButton({ secretId }: { secretId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteSecretAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="secretId" value={secretId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label="Supprimer le secret"
      >
        ✕
      </Button>
    </form>
  );
}
