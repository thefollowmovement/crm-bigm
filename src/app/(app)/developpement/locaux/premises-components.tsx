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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PREMISES_STATUS_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createPremisesAction,
  updatePremisesAction,
  uploadPremisesFilesAction,
} from "./actions";

type Option = { id: string; label: string };

export type PremisesFormValues = {
  address: string;
  city: string;
  postalCode: string | null;
  surfaceM2: string | null;
  monthlyRent: string | null;
  leaseRights: string | null;
  status: string;
  agentId: string | null;
  notes: string | null;
};

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

function PremisesFields({
  agents,
  values,
}: {
  agents: Option[];
  values?: PremisesFormValues;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="pm-address">Adresse</Label>
          <Input
            id="pm-address"
            name="address"
            required
            defaultValue={values?.address ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-city">Ville</Label>
          <Input id="pm-city" name="city" required defaultValue={values?.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-postal">Code postal</Label>
          <Input
            id="pm-postal"
            name="postalCode"
            defaultValue={values?.postalCode ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-surface">Surface (m²)</Label>
          <Input
            id="pm-surface"
            name="surfaceM2"
            inputMode="decimal"
            defaultValue={values?.surfaceM2 ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-rent">Loyer mensuel (€)</Label>
          <Input
            id="pm-rent"
            name="monthlyRent"
            inputMode="decimal"
            defaultValue={values?.monthlyRent ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-lease">Droit au bail (€)</Label>
          <Input
            id="pm-lease"
            name="leaseRights"
            inputMode="decimal"
            defaultValue={values?.leaseRights ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select name="status" defaultValue={values?.status ?? "DISPONIBLE"}>
            <SelectTrigger data-testid="premises-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PREMISES_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Agent immobilier</Label>
          <Select name="agentId" defaultValue={values?.agentId ?? "none"}>
            <SelectTrigger data-testid="premises-agent-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pm-notes">Notes</Label>
        <Textarea
          id="pm-notes"
          name="notes"
          rows={2}
          defaultValue={values?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function CreatePremisesDialog({ agents }: { agents: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPremisesAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-premises-button">
          <Plus /> Nouveau local
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Local commercial</DialogTitle>
          <DialogDescription>
            Base de locaux pour les implantations du réseau.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <PremisesFields agents={agents} />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="premises-submit"
          >
            {pending ? "Création…" : "Ajouter le local"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditPremisesForm({
  premisesId,
  agents,
  values,
}: {
  premisesId: string;
  agents: Option[];
  values: PremisesFormValues;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updatePremisesAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="premisesId" value={premisesId} />
      <PremisesFields agents={agents} values={values} />
      <Button type="submit" disabled={pending} data-testid="premises-update">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function PremisesFilesForm({ premisesId }: { premisesId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadPremisesFilesAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex items-center gap-2" key={state.success}>
      <input type="hidden" name="premisesId" value={premisesId} />
      <Input name="files" type="file" multiple className="h-9 max-w-64" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Envoi…" : "Joindre"}
      </Button>
    </form>
  );
}
