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
import {
  RESALE_STATUS_LABELS,
  RESALE_WISH_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { createResaleAction, updateResaleAction } from "./actions";

type Option = { id: string; label: string };

export type ResaleFormValues = {
  wish: string;
  askingPrice: string | null;
  urgency: string;
  status: string;
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

function ResaleFields({ values }: { values?: ResaleFormValues }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Souhait</Label>
          <Select name="wish" defaultValue={values?.wish ?? "VENTE_TOTALE"}>
            <SelectTrigger data-testid="resale-wish-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RESALE_WISH_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resale-price">Prix demandé (€)</Label>
          <Input
            id="resale-price"
            name="askingPrice"
            inputMode="decimal"
            defaultValue={values?.askingPrice ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Urgence</Label>
          <Select name="urgency" defaultValue={values?.urgency ?? "NORMALE"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select name="status" defaultValue={values?.status ?? "ACTIVE"}>
            <SelectTrigger data-testid="resale-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RESALE_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resale-notes">Notes (confidentielles au module)</Label>
        <Textarea
          id="resale-notes"
          name="notes"
          rows={2}
          defaultValue={values?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function CreateResaleDialog({ stores }: { stores: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createResaleAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-resale-button">
          <Plus /> Nouvelle cession
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Franchisé vendeur</DialogTitle>
          <DialogDescription>
            Suivi confidentiel des souhaits de cession du réseau.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Boutique concernée</Label>
            <Select name="storeId">
              <SelectTrigger data-testid="resale-store-select">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ResaleFields />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="resale-submit"
          >
            {pending ? "Création…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditResaleForm({
  resaleId,
  values,
}: {
  resaleId: string;
  values: ResaleFormValues;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateResaleAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="resaleId" value={resaleId} />
      <ResaleFields values={values} />
      <Button type="submit" disabled={pending} data-testid="resale-update">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
