"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from "@/lib/labels";
import { computeTTC, formatEUR } from "@/lib/money";
import type { ActionState } from "@/lib/actions/safe-action";

import { createInvoiceAction } from "./actions";

type Option = { id: string; label: string };

export function InvoiceFilters({
  current,
  stores,
}: {
  current: { statut?: string; retard: boolean; boutique?: string };
  stores: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={current.statut ?? "all"}
        onValueChange={(v) => setParam("statut", v)}
      >
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.boutique ?? "all"}
        onValueChange={(v) => setParam("boutique", v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Boutique" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les boutiques</SelectItem>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={current.retard}
          onCheckedChange={(checked) =>
            setParam("retard", checked === true ? "1" : null)
          }
          data-testid="overdue-filter"
        />
        En retard uniquement
      </label>
    </div>
  );
}

export function CreateInvoiceDialog({ stores }: { stores: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createInvoiceAction,
    {}
  );
  const [amountHT, setAmountHT] = useState("");
  const [vatRate, setVatRate] = useState("20.00");

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  let ttcPreview: string | null = null;
  try {
    if (amountHT) {
      ttcPreview = formatEUR(computeTTC(amountHT.replace(",", "."), vatRate.replace(",", ".")));
    }
  } catch {
    ttcPreview = null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-invoice-button">
          <Plus /> Nouvelle facture
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle facture</DialogTitle>
          <DialogDescription>
            Le numéro est attribué automatiquement (F{new Date().getFullYear()}-XXXX).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Boutique</Label>
            <Select name="storeId">
              <SelectTrigger data-testid="invoice-store">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="type" defaultValue="REDEVANCE">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INVOICE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-label">Libellé</Label>
              <Input
                id="invoice-label"
                name="label"
                placeholder="Redevance août 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodStart">Début de période</Label>
              <Input id="periodStart" name="periodStart" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodEnd">Fin de période</Label>
              <Input id="periodEnd" name="periodEnd" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amountHT">Montant HT (€)</Label>
              <Input
                id="amountHT"
                name="amountHT"
                required
                inputMode="decimal"
                placeholder="1000,00"
                value={amountHT}
                onChange={(e) => setAmountHT(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vatRate">TVA (%)</Label>
              <Input
                id="vatRate"
                name="vatRate"
                required
                inputMode="decimal"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issuedAt">Émise le</Label>
              <Input id="issuedAt" name="issuedAt" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Échéance</Label>
              <Input id="dueDate" name="dueDate" type="date" required />
            </div>
          </div>
          {ttcPreview ? (
            <p className="text-sm text-muted-foreground" data-testid="ttc-preview">
              Montant TTC calculé : <span className="font-medium">{ttcPreview}</span>
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="invoice-notes">Notes</Label>
            <Textarea id="invoice-notes" name="notes" rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer la facture"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
