"use client";

import { useActionState, useEffect, useState } from "react";
import { FileUp, Pencil, Plus } from "lucide-react";
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
import { ACCT_STRUCTURE_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createStructureAction,
  importStructuresAction,
  toggleStructureAction,
  updateStructureAction,
  type StructureImportState,
} from "./actions";

type StoreOption = { id: string; name: string };

export type StructureFormValues = {
  id: string;
  code: string;
  name: string;
  company: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  creditAvailable: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  vatNumber: string | null;
  siret: string | null;
  type: string;
  storeId: string | null;
  notes: string | null;
  isActive: boolean;
};

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

function StructureFields({
  stores,
  initial,
}: {
  stores: StoreOption[];
  initial?: StructureFormValues;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="structure-code">Code *</Label>
          <Input
            id="structure-code"
            name="code"
            required
            placeholder="411CDPS"
            defaultValue={initial?.code}
            data-testid="structure-code"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="structure-type">Type de structure</Label>
          <Select name="type" defaultValue={initial?.type ?? "AUTRE"}>
            <SelectTrigger id="structure-type" data-testid="structure-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACCT_STRUCTURE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="structure-name">Nom *</Label>
        <Input
          id="structure-name"
          name="name"
          required
          defaultValue={initial?.name}
          data-testid="structure-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="structure-company">Société</Label>
          <Input
            id="structure-company"
            name="company"
            defaultValue={initial?.company ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="structure-contact">Nom du contact</Label>
          <Input
            id="structure-contact"
            name="contactName"
            defaultValue={initial?.contactName ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="structure-phone">Téléphone</Label>
          <Input
            id="structure-phone"
            name="phone"
            defaultValue={initial?.phone ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="structure-email">E-mail</Label>
          <Input
            id="structure-email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="structure-address">Adresse</Label>
        <Input
          id="structure-address"
          name="address"
          defaultValue={initial?.address ?? ""}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="structure-postal">Code postal</Label>
          <Input
            id="structure-postal"
            name="postalCode"
            defaultValue={initial?.postalCode ?? ""}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="structure-city">Ville</Label>
          <Input
            id="structure-city"
            name="city"
            defaultValue={initial?.city ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="structure-vat">N° TVA intracom.</Label>
          <Input
            id="structure-vat"
            name="vatNumber"
            defaultValue={initial?.vatNumber ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="structure-siret">SIRET</Label>
          <Input
            id="structure-siret"
            name="siret"
            defaultValue={initial?.siret ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="structure-credit">Encours disponible (€)</Label>
          <Input
            id="structure-credit"
            name="creditAvailable"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={initial?.creditAvailable ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="structure-store">Boutique du réseau liée</Label>
          <Select name="storeId" defaultValue={initial?.storeId ?? "none"}>
            <SelectTrigger id="structure-store">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucune —</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="structure-notes">Notes</Label>
        <Textarea
          id="structure-notes"
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function CreateStructureDialog({ stores }: { stores: StoreOption[] }) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(createStructureAction, () =>
    setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-structure-button">
          <Plus /> Nouvelle structure
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle structure comptable</DialogTitle>
          <DialogDescription>
            Le code (ex. 411CDPS) est la clé de rapprochement avec le journal
            des factures importé du logiciel comptable.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <StructureFields stores={stores} />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="structure-submit"
          >
            {pending ? "Création…" : "Créer la structure"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditStructureDialog({
  structure,
  stores,
}: {
  structure: StructureFormValues;
  stores: StoreOption[];
}) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(updateStructureAction, () =>
    setOpen(false)
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Modifier ${structure.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier la structure</DialogTitle>
          <DialogDescription>{structure.code} — {structure.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={structure.id} />
          <StructureFields stores={stores} initial={structure} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleStructureButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const { formAction, pending } = useToastedState(toggleStructureAction);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={String(!isActive)} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {isActive ? "Désactiver" : "Réactiver"}
      </Button>
    </form>
  );
}

// ── Import multi-formats avec rapport détaillé ───────────────────

export function ImportStructuresDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    StructureImportState,
    FormData
  >(importStructuresAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const report = state.report;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="import-structures-button">
          <FileUp /> Importer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer le référentiel Structures</DialogTitle>
          <DialogDescription>
            Formats acceptés : .xlsx, .xls, .xlsb, .csv (export du logiciel
            comptable). Colonnes attendues : Code, Nom, Nom du contact,
            Téléphone, E-mail, Encours disponible, Date Dernière Commande,
            Adresse 1, Code Postal, Ville, N° TVA intracom, SIRET, Société.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="structures-file">Fichier</Label>
            <Input
              id="structures-file"
              name="file"
              type="file"
              accept=".xlsx,.xls,.xlsb,.csv"
              required
              data-testid="structures-file"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="structures-mode">Codes déjà présents dans le référentiel</Label>
            <Select name="mode" defaultValue="METTRE_A_JOUR">
              <SelectTrigger id="structures-mode" data-testid="structures-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="METTRE_A_JOUR">Mettre à jour les doublons</SelectItem>
                <SelectItem value="IGNORER">Ignorer les doublons</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="structures-import-submit"
          >
            {pending ? "Import en cours…" : "Lancer l'import"}
          </Button>
        </form>

        {report ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="import-report">
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
