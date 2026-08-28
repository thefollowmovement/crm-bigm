"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Send, Ticket } from "lucide-react";
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
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createProviderTicketAction,
  createProviderTransmissionAction,
  postProviderMessageAction,
} from "./actions";

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

// Dépôt d'une facture / note de frais vers la comptabilité.
export function ProviderDepositDialog() {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(
    createProviderTransmissionAction,
    () => setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="provider-deposit-button">
          <Plus /> Déposer une facture / note de frais
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau dépôt</DialogTitle>
          <DialogDescription>
            Votre document part directement à la comptabilité, qui vous tiendra
            informé de son traitement.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-type">Type *</Label>
              <Select name="type" defaultValue="FACTURE">
                <SelectTrigger id="dep-type" data-testid="deposit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FACTURE">Facture</SelectItem>
                  <SelectItem value="DEMANDE">Demande</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-case">Nature *</Label>
              <Select name="caseType" defaultValue="FACTURE_FOURNISSEUR">
                <SelectTrigger id="dep-case" data-testid="deposit-case">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FACTURE_FOURNISSEUR">Facture</SelectItem>
                  <SelectItem value="NOTE_DE_FRAIS">Note de frais</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-subject">Objet *</Label>
            <Input
              id="dep-subject"
              name="subject"
              required
              placeholder="Facture prestation août 2026"
              data-testid="deposit-subject"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-amount">Montant TTC (€)</Label>
            <Input
              id="dep-amount"
              name="amount"
              inputMode="decimal"
              placeholder="850,00"
              data-testid="deposit-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-message">Message</Label>
            <Textarea id="dep-message" name="message" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-files">Pièces jointes</Label>
            <Input
              id="dep-files"
              name="files"
              type="file"
              multiple
              data-testid="deposit-files"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="deposit-submit"
          >
            {pending ? "Envoi…" : "Transmettre à la comptabilité"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Ticket de demande vers la comptabilité.
export function ProviderTicketDialog() {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(createProviderTicketAction, () =>
    setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="provider-ticket-button">
          <Ticket /> Ouvrir un ticket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau ticket</DialogTitle>
          <DialogDescription>
            Une question, un litige, un justificatif manquant… La comptabilité
            reçoit votre demande et vous répond dans le fil du ticket.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-title">Titre *</Label>
            <Input
              id="ticket-title"
              name="title"
              required
              data-testid="provider-ticket-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-desc">Description *</Label>
            <Textarea
              id="ticket-desc"
              name="description"
              rows={4}
              required
              data-testid="provider-ticket-description"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="provider-ticket-submit"
          >
            {pending ? "Envoi…" : "Envoyer le ticket"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Fil de discussion d'une facture — côté prestataire.
export function ProviderMessageForm({ invoiceId }: { invoiceId: string }) {
  const { formAction, pending } = useToastedState(postProviderMessageAction);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Textarea
        name="body"
        rows={2}
        required
        placeholder="Votre message à la comptabilité…"
        className="flex-1"
        data-testid="provider-message-input"
      />
      <Button type="submit" disabled={pending} data-testid="provider-message-send">
        <Send /> {pending ? "…" : "Envoyer"}
      </Button>
    </form>
  );
}
