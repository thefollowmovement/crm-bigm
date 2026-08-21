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
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { createContractAction, updateContractAction } from "./actions";

export type ContractFormValues = {
  id?: string;
  storeId: string;
  type: string;
  status: string;
  reference: string | null;
  signedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  alertMonthsBefore: number;
  parentContractId: string | null;
  notes: string | null;
};

export function ContractFormFields({ contract }: { contract: ContractFormValues }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select name="type" defaultValue={contract.type}>
            <SelectTrigger data-testid="contract-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select name="status" defaultValue={contract.status}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reference">Référence interne</Label>
          <Input
            id="reference"
            name="reference"
            placeholder="CF-BM-001"
            defaultValue={contract.reference ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signedAt">Signé le</Label>
          <Input
            id="signedAt"
            name="signedAt"
            type="date"
            defaultValue={contract.signedAt ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Début</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={contract.startDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">Fin</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={contract.endDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alertMonthsBefore">Alerte (mois avant la fin)</Label>
          <Input
            id="alertMonthsBefore"
            name="alertMonthsBefore"
            type="number"
            min={0}
            max={24}
            defaultValue={contract.alertMonthsBefore}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={contract.notes ?? ""} />
      </div>
      <input
        type="hidden"
        name="parentContractId"
        value={contract.parentContractId ?? "none"}
      />
    </>
  );
}

const EMPTY = (storeId: string, parentContractId?: string): ContractFormValues => ({
  storeId,
  type: parentContractId ? "AVENANT" : "CONTRAT_FRANCHISE",
  status: "ACTIF",
  reference: null,
  signedAt: null,
  startDate: null,
  endDate: null,
  alertMonthsBefore: 6,
  parentContractId: parentContractId ?? null,
  notes: null,
});

export function CreateContractDialog({
  storeId,
  parentContractId,
  label = "Nouveau contrat",
}: {
  storeId: string;
  parentContractId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createContractAction,
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
        <Button data-testid="new-contract-button">
          <Plus /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            L&apos;alerte de fin de contrat se déclenche automatiquement le nombre de
            mois choisi avant l&apos;échéance.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="storeId" value={storeId} />
          <ContractFormFields contract={EMPTY(storeId, parentContractId)} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer le contrat"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditContractForm({ contract }: { contract: ContractFormValues }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateContractAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="contractId" value={contract.id} />
      <input type="hidden" name="storeId" value={contract.storeId} />
      <ContractFormFields contract={contract} />
      <Button type="submit" disabled={pending} data-testid="contract-form-submit">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
