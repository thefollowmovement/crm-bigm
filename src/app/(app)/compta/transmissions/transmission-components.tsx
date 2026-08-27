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
  ACCT_CLASS_LABELS,
  ACCT_INVOICE_TYPE_LABELS,
  ACCT_PIECE_TYPE_LABELS,
  POLE_LABELS,
  TRANSMISSION_CASE_LABELS,
  TRANSMISSION_STATUS_LABELS,
  TRANSMISSION_TYPE_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  changeTransmissionStatusAction,
  convertTransmissionAction,
  createTransmissionAction,
} from "./actions";

type Option = { id: string; label: string };

function useToastedState(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  onSuccess?: () => void
) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return { formAction, pending };
}

// Création d'une transmission : le franchisé est contraint à SA boutique et
// au pôle comptabilité ; les internes choisissent librement.
export function CreateTransmissionDialog({
  structures,
  stores,
  isFranchise,
}: {
  structures: Option[];
  stores: Option[];
  isFranchise: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(createTransmissionAction, () =>
    setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-transmission-button">
          <Plus /> Nouvelle transmission
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle transmission comptable</DialogTitle>
          <DialogDescription>
            Demande (remboursement, validation…) ou envoi d&apos;une facture
            formelle, avec pièces jointes. La comptabilité est notifiée.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr-type">Type *</Label>
              <Select name="type" defaultValue="FACTURE">
                <SelectTrigger id="tr-type" data-testid="transmission-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSMISSION_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-case">Cas d&apos;usage *</Label>
              <Select name="caseType" defaultValue="FACTURE_FOURNISSEUR">
                <SelectTrigger id="tr-case" data-testid="transmission-case">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSMISSION_CASE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isFranchise ? (
            <input type="hidden" name="targetPole" value="COMPTABILITE" />
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="tr-pole">Destinataire</Label>
              <Select name="targetPole" defaultValue="COMPTABILITE">
                <SelectTrigger id="tr-pole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POLE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr-store">
                Boutique {isFranchise ? "*" : "(optionnel)"}
              </Label>
              <Select name="storeId" defaultValue={isFranchise && stores.length === 1 ? stores[0].id : "none"}>
                <SelectTrigger id="tr-store" data-testid="transmission-store">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isFranchise ? null : <SelectItem value="none">— Aucune —</SelectItem>}
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-structure">Structure liée (optionnel)</Label>
              <Select name="structureId" defaultValue="none">
                <SelectTrigger id="tr-structure">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucune —</SelectItem>
                  {structures.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-subject">Objet *</Label>
            <Input
              id="tr-subject"
              name="subject"
              required
              placeholder="Facture influenceur — campagne juillet"
              data-testid="transmission-subject"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-amount">Montant (€, optionnel)</Label>
            <Input
              id="tr-amount"
              name="amount"
              inputMode="decimal"
              placeholder="1234,56"
              data-testid="transmission-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-message">Message</Label>
            <Textarea id="tr-message" name="message" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-files">Pièces jointes</Label>
            <Input
              id="tr-files"
              name="files"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx"
              data-testid="transmission-files"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="transmission-submit"
          >
            {pending ? "Envoi…" : "Envoyer la transmission"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Changement de statut avec commentaire (compta/direction).
export function StatusForm({
  transmissionId,
  currentStatus,
}: {
  transmissionId: string;
  currentStatus: string;
}) {
  const { formAction, pending } = useToastedState(changeTransmissionStatusAction);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={transmissionId} />
      <div className="space-y-1.5">
        <Label htmlFor="status-select">Statut</Label>
        <Select name="status" defaultValue={currentStatus}>
          <SelectTrigger id="status-select" data-testid="transmission-status-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TRANSMISSION_STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status-comment">Commentaire (visible de l&apos;émetteur)</Label>
        <Textarea id="status-comment" name="comment" rows={2} />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="w-full"
        data-testid="transmission-status-submit"
      >
        {pending ? "Enregistrement…" : "Changer le statut"}
      </Button>
    </form>
  );
}

// Conversion d'une transmission validée en pièce du journal.
export function ConvertForm({
  transmissionId,
  structures,
  defaults,
}: {
  transmissionId: string;
  structures: Option[];
  defaults: { structureId: string | null; amount: string | null; date: string };
}) {
  const { formAction, pending } = useToastedState(convertTransmissionAction);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={transmissionId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cv-number">N° de pièce *</Label>
          <Input
            id="cv-number"
            name="pieceNumber"
            required
            data-testid="convert-piece-number"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-piece-type">Type de pièce</Label>
          <Select name="pieceType" defaultValue="FACTURE">
            <SelectTrigger id="cv-piece-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACCT_PIECE_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cv-class">Classe comptable *</Label>
          <Select name="accountClass" defaultValue="CHARGE">
            <SelectTrigger id="cv-class" data-testid="convert-class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACCT_CLASS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-invoice-type">Type de facture</Label>
          <Select name="invoiceType" defaultValue="STANDARD">
            <SelectTrigger id="cv-invoice-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACCT_INVOICE_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cv-structure">Structure *</Label>
        <Select name="structureId" defaultValue={defaults.structureId ?? undefined}>
          <SelectTrigger id="cv-structure" data-testid="convert-structure">
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {structures.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cv-date">Date de pièce *</Label>
          <Input
            id="cv-date"
            name="pieceDate"
            type="date"
            required
            defaultValue={defaults.date}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-due">Échéance</Label>
          <Input id="cv-due" name="dueDate" type="date" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cv-ht">Total HT (€) *</Label>
          <Input
            id="cv-ht"
            name="amountHT"
            inputMode="decimal"
            required
            defaultValue={defaults.amount ?? ""}
            data-testid="convert-ht"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-ttc">Total TTC (€) *</Label>
          <Input
            id="cv-ttc"
            name="amountTTC"
            inputMode="decimal"
            required
            defaultValue={defaults.amount ?? ""}
            data-testid="convert-ttc"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="w-full"
        data-testid="convert-submit"
      >
        {pending ? "Conversion…" : "Créer la facture au journal"}
      </Button>
    </form>
  );
}
