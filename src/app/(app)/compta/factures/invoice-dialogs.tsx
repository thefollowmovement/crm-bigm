"use client";

import { useActionState, useEffect, useState } from "react";
import { FileUp, Paperclip, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_INVOICE_TYPE_LABELS,
  ACCT_PIECE_TYPE_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addInvoiceFilesAction,
  createInvoiceAction,
  importInvoicesAction,
  updateInvoiceAction,
  type InvoiceImportState,
} from "./actions";

type StructureOption = { id: string; code: string; name: string };

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

export function CreateInvoiceDialog({
  structures,
}: {
  structures: StructureOption[];
}) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(createInvoiceAction, () =>
    setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-invoice-button">
          <Plus /> Nouvelle pièce
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle facture / avoir</DialogTitle>
          <DialogDescription>
            Saisie manuelle d&apos;une pièce comptable. Un avoir porte des
            montants négatifs.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-number">N° de pièce *</Label>
              <Input
                id="invoice-number"
                name="pieceNumber"
                required
                data-testid="invoice-number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-piece-type">Type de pièce</Label>
              <Select name="pieceType" defaultValue="FACTURE">
                <SelectTrigger id="invoice-piece-type">
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
              <Label htmlFor="invoice-class">Classe comptable *</Label>
              <Select name="accountClass" defaultValue="CHARGE">
                <SelectTrigger id="invoice-class" data-testid="invoice-class">
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
              <Label htmlFor="invoice-type">Type de facture</Label>
              <Select name="invoiceType" defaultValue="STANDARD">
                <SelectTrigger id="invoice-type">
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
            <Label htmlFor="invoice-structure">Structure liée *</Label>
            <Select name="structureId">
              <SelectTrigger id="invoice-structure" data-testid="invoice-structure">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {structures.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-date">Date de pièce *</Label>
              <Input
                id="invoice-date"
                name="pieceDate"
                type="date"
                required
                data-testid="invoice-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-due">Échéance</Label>
              <Input id="invoice-due" name="dueDate" type="date" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-ht">Total HT (€) *</Label>
              <Input
                id="invoice-ht"
                name="amountHT"
                inputMode="decimal"
                required
                placeholder="1234,56"
                data-testid="invoice-ht"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-ttc">Total TTC (€) *</Label>
              <Input
                id="invoice-ttc"
                name="amountTTC"
                inputMode="decimal"
                required
                placeholder="1481,47"
                data-testid="invoice-ttc"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-label">Libellé</Label>
            <Input id="invoice-label" name="label" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-notes">Notes</Label>
            <Textarea id="invoice-notes" name="notes" rows={2} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="invoice-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer la pièce"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditInvoiceDialog({
  invoice,
}: {
  invoice: {
    id: string;
    pieceNumber: string;
    status: string;
    invoiceType: string;
    accountClass: string;
    dueDate: string | null;
    notes: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(updateInvoiceAction, () =>
    setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Modifier ${invoice.pieceNumber}`}
          data-testid={`edit-invoice-${invoice.pieceNumber}`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pièce {invoice.pieceNumber}</DialogTitle>
          <DialogDescription>
            Le statut est renseigné par la comptabilité au fil du traitement
            (un réimport ne l&apos;écrase que si le fichier porte une colonne
            Statut).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={invoice.id} />
          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Statut</Label>
            <Select name="status" defaultValue={invoice.status}>
              <SelectTrigger id="edit-status" data-testid="invoice-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCT_INVOICE_STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-class">Classe comptable</Label>
              <Select name="accountClass" defaultValue={invoice.accountClass}>
                <SelectTrigger id="edit-class">
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
              <Label htmlFor="edit-invoice-type">Type de facture</Label>
              <Select name="invoiceType" defaultValue={invoice.invoiceType}>
                <SelectTrigger id="edit-invoice-type">
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
            <Label htmlFor="edit-due">Échéance</Label>
            <Input
              id="edit-due"
              name="dueDate"
              type="date"
              defaultValue={invoice.dueDate ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              name="notes"
              rows={2}
              defaultValue={invoice.notes ?? ""}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="invoice-update-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// PJ d'une pièce du journal (étape 51) : liste des documents + ajout.
export function InvoiceAttachmentsDialog({
  invoice,
  attachments,
  canWrite,
}: {
  invoice: { id: string; pieceNumber: string };
  attachments: { id: string; originalName: string }[];
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(addInvoiceFilesAction);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2"
          aria-label={`Documents de ${invoice.pieceNumber}`}
          data-testid={`invoice-files-${invoice.pieceNumber}`}
        >
          <Paperclip />
          {attachments.length > 0 ? (
            <span className="text-xs tabular-nums">{attachments.length}</span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Documents — pièce {invoice.pieceNumber}</DialogTitle>
          <DialogDescription>
            Facture scannée, justificatif, bon de livraison… Les fichiers sont
            servis uniquement aux profils comptabilité/direction.
          </DialogDescription>
        </DialogHeader>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun document.</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="invoice-files-list">
            {attachments.map((file) => (
              <li key={file.id}>
                <a
                  href={`/api/files/${file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {file.originalName}
                </a>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <Input
              name="files"
              type="file"
              multiple
              required
              data-testid="invoice-files-input"
            />
            <Button
              type="submit"
              className="w-full"
              disabled={pending}
              data-testid="invoice-files-submit"
            >
              {pending ? "Envoi…" : "Ajouter les documents"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ImportInvoicesDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    InvoiceImportState,
    FormData
  >(importInvoicesAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const report = state.report;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="import-invoices-button">
          <FileUp /> Importer le journal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer le journal Factures / Avoirs</DialogTitle>
          <DialogDescription>
            Formats : .xlsx, .xls, .xlsb, .csv. Colonnes attendues : Type de
            pièce, N° pièce, Date Pièce, Client (= code du référentiel
            Structures), Société, Total HT, Total TVA, Total TTC. Colonne
            Statut optionnelle (Payé, Impayé, En retard, En attente, Annulé) :
            si elle est renseignée, elle est appliquée aux pièces créées et
            mises à jour ; sinon le statut reste géré à la main dans le CRM.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoices-file">Fichier</Label>
            <Input
              id="invoices-file"
              name="file"
              type="file"
              accept=".xlsx,.xls,.xlsb,.csv"
              required
              data-testid="invoices-file"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoices-class">
              Classe comptable des pièces du fichier *
            </Label>
            <Select name="accountClass" defaultValue="PRODUIT">
              <SelectTrigger id="invoices-class" data-testid="invoices-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUIT">
                  7 — Produit (journal des ventes)
                </SelectItem>
                <SelectItem value="CHARGE">
                  6 — Charge (journal des achats)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoices-mode">N° de pièce déjà importés</Label>
            <Select name="mode" defaultValue="METTRE_A_JOUR">
              <SelectTrigger id="invoices-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="METTRE_A_JOUR">
                  Mettre à jour les doublons
                </SelectItem>
                <SelectItem value="IGNORER">Ignorer les doublons</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="invoices-import-submit"
          >
            {pending ? "Import en cours…" : "Lancer l'import"}
          </Button>
        </form>

        {report ? (
          <div
            className="space-y-2 rounded-lg border p-3 text-sm"
            data-testid="invoices-import-report"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{report.fileName}</Badge>
              <Badge variant="outline">{report.format.toUpperCase()}</Badge>
            </div>
            <p>
              {report.totalRows} ligne{report.totalRows > 1 ? "s" : ""} lue
              {report.totalRows > 1 ? "s" : ""} — {report.created} créée
              {report.created > 1 ? "s" : ""}, {report.updated} mise
              {report.updated > 1 ? "s" : ""} à jour, {report.skipped} ignorée
              {report.skipped > 1 ? "s" : ""}, {report.errors.length} en erreur.
            </p>
            {report.errors.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-destructive">
                {report.errors.map((e, i) => (
                  <li key={i}>
                    Ligne {e.line} : {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
