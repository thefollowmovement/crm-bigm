"use client";

import { useActionState, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
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

import { createProviderAccountAction } from "./actions";

// Création d'un accès CRM prestataire depuis la fiche client (étape 53).
export function CreateProviderAccountDialog({
  structureId,
  structureName,
}: {
  structureId: string;
  structureName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createProviderAccountAction,
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
        <Button variant="outline" size="sm" data-testid="new-provider-account">
          <UserPlus /> Créer un accès CRM
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accès prestataire — {structureName}</DialogTitle>
          <DialogDescription>
            Le compte (rôle Prestataire externe) n&apos;ouvre QUE l&apos;espace
            /prestataire : ses factures, leurs statuts de paiement, le dépôt de
            documents, la discussion avec la comptabilité et les tickets.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="structureId" value={structureId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pa-firstName">Prénom *</Label>
              <Input
                id="pa-firstName"
                name="firstName"
                required
                data-testid="provider-account-firstname"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pa-lastName">Nom *</Label>
              <Input
                id="pa-lastName"
                name="lastName"
                required
                data-testid="provider-account-lastname"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pa-email">E-mail de connexion *</Label>
            <Input
              id="pa-email"
              name="email"
              type="email"
              required
              data-testid="provider-account-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pa-password">Mot de passe initial *</Label>
            <Input
              id="pa-password"
              name="password"
              type="text"
              required
              minLength={10}
              placeholder="À transmettre au prestataire"
              data-testid="provider-account-password"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="provider-account-submit"
          >
            {pending ? "Création…" : "Créer l'accès"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
