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
import { REVENUE_CHANNEL_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  confirmImportAction,
  parseCsvAction,
  upsertEntryAction,
  type CsvPreviewState,
} from "./actions";

type Option = { id: string; label: string };

export function CaFilters({
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
        <SelectTrigger className="w-72" data-testid="ca-store-filter">
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
        data-testid="ca-month-filter"
      />
    </div>
  );
}

const NET_CHANNELS = new Set(["UBER_EATS", "DELIVEROO", "AUTRE"]);

export function RevenueEntryDialog({
  storeId,
  storeLabel,
}: {
  storeId: string;
  storeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("SUR_PLACE");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    upsertEntryAction,
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
        <Button data-testid="new-revenue-button">
          <Plus /> Saisir le CA
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="revenue-entry-dialog">
        <DialogHeader>
          <DialogTitle>Saisir le chiffre d&apos;affaires</DialogTitle>
          <DialogDescription>
            {storeLabel}. Une saisie existante pour le même jour et le même canal
            est remplacée.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="storeId" value={storeId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="revenue-date">Date</Label>
              <Input id="revenue-date" name="date" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select name="channel" value={channel} onValueChange={setChannel}>
                <SelectTrigger data-testid="revenue-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REVENUE_CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revenue-gross">Montant brut (€)</Label>
              <Input
                id="revenue-gross"
                name="grossAmount"
                required
                inputMode="decimal"
                placeholder="1500,00"
              />
            </div>
            {NET_CHANNELS.has(channel) ? (
              <div className="space-y-1.5">
                <Label htmlFor="revenue-net">Montant net (€)</Label>
                <Input
                  id="revenue-net"
                  name="netAmount"
                  inputMode="decimal"
                  placeholder="après commission"
                />
              </div>
            ) : (
              <input type="hidden" name="netAmount" value="" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revenue-orders">Nb commandes (facultatif)</Label>
            <Input
              id="revenue-orders"
              name="orderCount"
              inputMode="numeric"
              placeholder="ex. 120"
            />
          </div>
          {channel === "AUTRE" ? (
            <div className="space-y-1.5">
              <Label htmlFor="revenue-channel-label">Libellé du canal</Label>
              <Input id="revenue-channel-label" name="channelLabel" required />
            </div>
          ) : (
            <input type="hidden" name="channelLabel" value="" />
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="revenue-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CsvImportCard() {
  const [preview, parseAction, parsing] = useActionState<CsvPreviewState, FormData>(
    parseCsvAction,
    {}
  );
  const [confirmState, confirmAction, confirming] = useActionState<
    ActionState,
    FormData
  >(confirmImportAction, {});
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
        <CardTitle>Import CSV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Colonnes attendues : <code>boutique;date;canal;montant_brut;montant_net</code>{" "}
          — séparateur « ; » ou « , », dates JJ/MM/AAAA, montants « 1 234,56 ».
          Rien n&apos;est écrit avant votre validation de la prévisualisation.
        </p>
        <form action={parseAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">Fichier CSV</Label>
            <Input
              id="csv-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="w-80"
              data-testid="csv-file-input"
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
                data-testid="csv-errors"
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
                  {preview.errors.length > 10 ? (
                    <li>… et {preview.errors.length - 10} autres</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {preview.rows && preview.rows.length > 0 ? (
              <>
                <div className="max-h-72 overflow-y-auto rounded-lg border" data-testid="csv-preview">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Boutique</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-right">Brut</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.storeCode}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{REVENUE_CHANNEL_LABELS[row.channel]}</TableCell>
                          <TableCell className="text-right">{row.grossAmount}</TableCell>
                          <TableCell className="text-right">
                            {row.netAmount ?? "—"}
                          </TableCell>
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
                  <Button type="submit" disabled={confirming} data-testid="csv-confirm">
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
