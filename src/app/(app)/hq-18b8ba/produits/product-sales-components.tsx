"use client";

import { useActionState, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  confirmProductImportAction,
  parseProductCsvAction,
  type ProductCsvPreviewState,
} from "./product-actions";

// Import CSV des ventes par produit — même flux en deux temps que le CA.
export function ProductCsvImportCard() {
  const [preview, parseAction, parsing] = useActionState<
    ProductCsvPreviewState,
    FormData
  >(parseProductCsvAction, {});
  const [confirmState, confirmAction, confirming] = useActionState<
    ActionState,
    FormData
  >(confirmProductImportAction, {});
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
        <CardTitle>Import CSV des ventes produits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Colonnes attendues : <code>boutique;date;produit;quantite;montant</code>{" "}
          — le code produit doit exister dans le référentiel (menu
          Administration). Rien n&apos;est écrit avant votre validation.
        </p>
        <form action={parseAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-csv-file">Fichier CSV</Label>
            <Input
              id="product-csv-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="w-80"
              data-testid="product-csv-file-input"
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
                data-testid="product-csv-errors"
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
                <div
                  className="max-h-72 overflow-y-auto rounded-lg border"
                  data-testid="product-csv-preview"
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Boutique</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Quantité</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.storeCode}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.productCode}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">
                            {row.amount ?? "—"}
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
                  <Button
                    type="submit"
                    disabled={confirming}
                    data-testid="product-csv-confirm"
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
