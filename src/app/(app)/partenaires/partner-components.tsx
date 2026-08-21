"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  createPartnerAction,
  setPartnerStoresAction,
  updatePartnerAction,
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

type PartnerValues = {
  companyName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  domain: string | null;
  tariffNotes: string | null;
  scopeNotes: string | null;
  internalNotes?: string | null;
};

function PartnerFields({ values }: { values?: PartnerValues }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="partner-company">Raison sociale</Label>
          <Input
            id="partner-company"
            name="companyName"
            required
            defaultValue={values?.companyName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-domain">Domaine d&apos;intervention</Label>
          <Input
            id="partner-domain"
            name="domain"
            placeholder="Print, vidéo, Ads…"
            defaultValue={values?.domain ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-contact">Interlocuteur</Label>
          <Input
            id="partner-contact"
            name="contactName"
            defaultValue={values?.contactName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-phone">Téléphone</Label>
          <Input id="partner-phone" name="phone" defaultValue={values?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-email">E-mail</Label>
          <Input
            id="partner-email"
            name="email"
            type="email"
            defaultValue={values?.email ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partner-tariffs">Devis / tarifs</Label>
        <Textarea
          id="partner-tariffs"
          name="tariffNotes"
          rows={2}
          defaultValue={values?.tariffNotes ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partner-scope">Champ d&apos;action</Label>
        <Textarea
          id="partner-scope"
          name="scopeNotes"
          rows={2}
          defaultValue={values?.scopeNotes ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partner-internal">Commentaires internes (pôle communication)</Label>
        <Textarea
          id="partner-internal"
          name="internalNotes"
          rows={2}
          defaultValue={values?.internalNotes ?? ""}
          data-testid="partner-internal-notes"
        />
      </div>
    </>
  );
}

export function CreatePartnerDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPartnerAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-partner-button">
          <Plus /> Nouveau partenaire
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau partenaire</DialogTitle>
          <DialogDescription>
            Société, interlocuteur, tarifs, champ d&apos;action — historique des
            tâches rattaché automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <PartnerFields />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="partner-submit"
          >
            {pending ? "Création…" : "Créer le partenaire"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditPartnerForm({
  partnerId,
  values,
}: {
  partnerId: string;
  values: PartnerValues;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updatePartnerAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="partnerId" value={partnerId} />
      <PartnerFields values={values} />
      <Button type="submit" disabled={pending} data-testid="partner-update">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function PartnerStoresEditor({
  partnerId,
  stores,
  selected,
}: {
  partnerId: string;
  stores: { id: string; label: string }[];
  selected: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setPartnerStoresAction,
    {}
  );
  useToasted(state);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="storeIds" value={JSON.stringify([...checked])} />
      <div className="space-y-2">
        {stores.map((store) => (
          <label key={store.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={checked.has(store.id)}
              onCheckedChange={(v) => {
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (v === true) next.add(store.id);
                  else next.delete(store.id);
                  return next;
                });
              }}
            />
            {store.label}
          </label>
        ))}
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="partner-stores-submit"
      >
        {pending ? "Enregistrement…" : "Mettre à jour"}
      </Button>
    </form>
  );
}
