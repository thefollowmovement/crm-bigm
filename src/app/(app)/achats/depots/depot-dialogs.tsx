"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import type { ActionState } from "@/lib/actions/safe-action";

import { createDepotAction, toggleDepotAction } from "../actions";

export function CreateDepotDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createDepotAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-depot-button">
          <Plus /> Nouveau dépôt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau dépôt DPS</DialogTitle>
          <DialogDescription>
            Le code sert de clé dans les imports CSV et pour les tarifs du Food
            Cost (variables par zone).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="depot-code">Code</Label>
              <Input id="depot-code" name="code" required placeholder="DPS-LYON" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="depot-city">Ville</Label>
              <Input id="depot-city" name="city" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depot-name">Nom</Label>
            <Input id="depot-name" name="name" required />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="depot-submit"
          >
            {pending ? "Création…" : "Créer le dépôt"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleDepotButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    toggleDepotAction,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {isActive ? "Désactiver" : "Réactiver"}
      </Button>
    </form>
  );
}
