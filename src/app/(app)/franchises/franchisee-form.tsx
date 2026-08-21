"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FranchiseeDTO } from "@/lib/authz/field-visibility";
import type { ActionState } from "@/lib/actions/safe-action";

import { createFranchiseeAction, updateFranchiseeAction } from "./actions";

export function FranchiseeForm({
  franchisee,
  canSeeNotes,
}: {
  franchisee?: FranchiseeDTO;
  canSeeNotes: boolean;
}) {
  const router = useRouter();
  const action = franchisee ? updateFranchiseeAction : createFranchiseeAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      if (!franchisee) router.push("/franchises");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {franchisee ? (
        <input type="hidden" name="franchiseeId" value={franchisee.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="companyName">Raison sociale</Label>
          <Input
            id="companyName"
            name="companyName"
            required
            defaultValue={franchisee?.companyName}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legalForm">Forme juridique</Label>
          <Input
            id="legalForm"
            name="legalForm"
            placeholder="SARL, SAS…"
            defaultValue={franchisee?.legalForm ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="siren">SIREN</Label>
          <Input
            id="siren"
            name="siren"
            placeholder="9 chiffres"
            defaultValue={franchisee?.siren ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" defaultValue={franchisee?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactFirstName">Prénom du contact</Label>
          <Input
            id="contactFirstName"
            name="contactFirstName"
            required
            defaultValue={franchisee?.contactFirstName}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactLastName">Nom du contact</Label>
          <Input
            id="contactLastName"
            name="contactLastName"
            required
            defaultValue={franchisee?.contactLastName}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={franchisee?.email ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input id="address" name="address" defaultValue={franchisee?.address ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postalCode">Code postal</Label>
          <Input
            id="postalCode"
            name="postalCode"
            defaultValue={franchisee?.postalCode ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" name="city" defaultValue={franchisee?.city ?? ""} />
        </div>
      </div>

      {canSeeNotes ? (
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes internes (siège uniquement)</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={franchisee?.notes ?? ""}
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} data-testid="franchisee-form-submit">
          {pending
            ? "Enregistrement…"
            : franchisee
              ? "Enregistrer"
              : "Créer le franchisé"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
