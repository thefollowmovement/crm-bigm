"use client";

import { useActionState, useEffect, useState } from "react";
import { Ban, BellRing, Euro } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { PAYMENT_METHOD_LABELS, REMINDER_CHANNEL_LABELS } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addReminderAction,
  cancelInvoiceAction,
  recordPaymentAction,
} from "../actions";

export function AddPaymentDialog({
  invoiceId,
  remaining,
}: {
  invoiceId: string;
  remaining: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordPaymentAction,
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
        <Button data-testid="add-payment-button">
          <Euro /> Enregistrer un paiement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau paiement</DialogTitle>
          <DialogDescription>
            Restant dû : {formatEUR(remaining)}. Le statut de la facture est
            recalculé automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Montant (€)</Label>
              <Input
                id="payment-amount"
                name="amount"
                required
                inputMode="decimal"
                placeholder={remaining.replace(".", ",")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Date</Label>
              <Input id="payment-date" name="paidAt" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label>Moyen</Label>
              <Select name="method" defaultValue="VIREMENT">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-reference">Référence</Label>
              <Input id="payment-reference" name="reference" placeholder="N° virement" />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="payment-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer le paiement"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddReminderDialog({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addReminderAction,
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
        <Button variant="outline" data-testid="add-reminder-button">
          <BellRing /> Relancer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle relance</DialogTitle>
          <DialogDescription>
            Niveau 1 : rappel simple · 2 : relance ferme · 3 : mise en demeure.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Niveau</Label>
              <Select name="level" defaultValue="1">
                <SelectTrigger data-testid="reminder-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Niveau 1</SelectItem>
                  <SelectItem value="2">Niveau 2</SelectItem>
                  <SelectItem value="3">Niveau 3 (mise en demeure)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select name="channel" defaultValue="EMAIL">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REMINDER_CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-date">Envoyée le</Label>
              <Input id="reminder-date" name="sentAt" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-file">Courrier (PJ)</Label>
              <Input id="reminder-file" name="file" type="file" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reminder-notes">Notes</Label>
            <Textarea id="reminder-notes" name="notes" rows={2} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="reminder-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer la relance"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    cancelInvoiceAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" data-testid="cancel-invoice-button">
          <Ban /> Annuler
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler cette facture ?</AlertDialogTitle>
          <AlertDialogDescription>
            La facture restera visible avec le statut « Annulée » et ne pourra
            plus recevoir de paiement. Cette action est tracée dans le journal
            d&apos;audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Retour</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <AlertDialogAction type="submit" disabled={pending}>
              Confirmer l&apos;annulation
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
