"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  confirmPurchaseImportAction,
  parsePurchaseCsvAction,
  upsertPurchaseAction,
  type PurchaseCsvPreviewState,
} from "./actions";

type Option = { id: string; label: string };

export function PurchaseFilters({
  stores,
  current,
}: {
  stores: Option[];
  current: { boutique: string; mois: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={current.boutique} onValueChange={(v) => setParam("boutique", v)}>
        <SelectTrigger className="w-72" data-testid="purchase-store-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="month"
        className="w-44"
        value={current.mois}
        onChange={(e) => e.target.value && setParam("mois", e.target.value)}
        data-testid="purchase-month-filter"
      />
    </div>
  );
}

export function PurchaseDialog({
  storeId,
  storeLabel,
  depots,
}: {
  storeId: string;
  storeLabel: string;
  depots: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    upsertPurchaseAction,
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
        <Button data-testid="new-purchase-button">
          <Plus /> Saisir un achat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saisir un achat DPS</DialogTitle>
          <DialogDescription>
            {storeLabel}. Une saisie existante avec la même date et la même
            référence est remplacée.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="storeId" value={storeId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dépôt</Label>
              <Select name="depotId" required>
                <SelectTrigger data-testid="purchase-depot-select">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {depots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-date">Date</Label>
              <Input id="purchase-date" name="date" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-ref">Référence (BL / facture)</Label>
              <Input id="purchase-ref" name="reference" required placeholder="BL-2026-1234" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-amount">Montant (€)</Label>
              <Input
                id="purchase-amount"
                name="amount"
                required
                inputMode="decimal"
                placeholder="1 250,00"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase-notes">Notes</Label>
            <Input id="purchase-notes" name="notes" />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="purchase-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseCsvImportCard() {
  const [preview, parseAction, parsing] = useActionState<
    PurchaseCsvPreviewState,
    FormData
  >(parsePurchaseCsvAction, {});
  const [confirmState, confirmAction, confirming] = useActionState<
    ActionState,
    FormData
  >(confirmPurchaseImportAction, {});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (preview.error) toast.error(preview.error);
    if (preview.rows) setDismissed(false);
  }, [preview]);

  useEffect(() => {
    if (confirmState.error) toast.error(confirmState.error);
    if (confirmState.success) {
      toast.success(confirmState.success);
      setDismissed(true);
    }
  }, [confirmState]);

  const showPreview = preview.rows !== undefined && !dismissed;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import CSV des achats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Colonnes attendues : <code>boutique;depot;date;reference;montant</code>{" "}
          — la référence (BL / facture) sert de clé : ré-importer un fichier met
          à jour sans dupliquer. Rien n&apos;est écrit avant votre validation.
        </p>
        <form action={parseAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="purchase-csv-file">Fichier CSV</Label>
            <Input
              id="purchase-csv-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="w-80"
              data-testid="purchase-csv-file-input"
            />
          </div>
          <Button type="submit" variant="outline" disabled={parsing}>
            <Upload /> {parsing ? "Analyse…" : "Analyser le fichier"}
          </Button>
        </form>

        {showPreview ? (
          <div className="space-y-3">
            {preview.errors && preview.errors.length > 0 ? (
              <div
                className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm"
                data-testid="purchase-csv-errors"
              >
                <div className="font-medium text-destructive">
                  {preview.errors.length} ligne{preview.errors.length > 1 ? "s" : ""} en
                  erreur (ignorée{preview.errors.length > 1 ? "s" : ""} à l&apos;import) :
                </div>
                <ul className="mt-1 list-inside list-disc text-destructive">
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      Ligne {e.line} : {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.rows && preview.rows.length > 0 ? (
              <>
                <div
                  className="max-h-72 overflow-y-auto rounded-lg border"
                  data-testid="purchase-csv-preview"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Boutique</TableHead>
                        <TableHead>Dépôt</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Référence</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.storeCode}</TableCell>
                          <TableCell>{row.depotCode}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.reference}</TableCell>
                          <TableCell className="text-right">{row.amount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <form action={confirmAction}>
                  <input
                    type="hidden"
                    name="rows"
                    value={JSON.stringify(preview.rows)}
                  />
                  <Button
                    type="submit"
                    disabled={confirming}
                    data-testid="purchase-csv-confirm"
                  >
                    {confirming
                      ? "Import…"
                      : `Valider l'import (${preview.rows.length} ligne${preview.rows.length > 1 ? "s" : ""})`}
                  </Button>
                </form>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune ligne valide dans ce fichier — rien ne sera importé.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
