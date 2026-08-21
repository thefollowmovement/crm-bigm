"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions/safe-action";

import { upsertProfileAction } from "./actions";

export function ProfileForm({
  userId,
  profile,
}: {
  userId: string;
  profile: {
    zone: string | null;
    theoreticalRoute: string | null;
    costPerKm: string | null;
    notes: string | null;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    upsertProfileAction,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-zone">Zone</Label>
          <Input
            id="profile-zone"
            name="zone"
            defaultValue={profile?.zone ?? ""}
            placeholder="Rhône-Alpes"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-cost">Coût kilométrique (€/km)</Label>
          <Input
            id="profile-cost"
            name="costPerKm"
            inputMode="decimal"
            defaultValue={profile?.costPerKm ?? ""}
            placeholder="0,45"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-route">Itinéraire théorique</Label>
        <Textarea
          id="profile-route"
          name="theoreticalRoute"
          rows={2}
          defaultValue={profile?.theoreticalRoute ?? ""}
          placeholder="Lyon → Villeurbanne → Saint-Étienne…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-notes">Notes</Label>
        <Textarea
          id="profile-notes"
          name="notes"
          rows={2}
          defaultValue={profile?.notes ?? ""}
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="profile-submit">
        {pending ? "Enregistrement…" : "Enregistrer la fiche"}
      </Button>
    </form>
  );
}
