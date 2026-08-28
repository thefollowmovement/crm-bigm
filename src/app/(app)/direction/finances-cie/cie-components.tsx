"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { COMPANY_FLOW_CATEGORY_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { addFlowAction, deleteFlowAction, setBudgetAction } from "./actions";

type Option = { id: string; label: string };

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

const MONTH_LABELS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function MonthPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setMonth(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("mois", value);
    params.set("annee", String(year));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={String(month)} onValueChange={setMonth}>
      <SelectTrigger className="w-44" data-testid="cie-month-picker">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MONTH_LABELS.map((label, index) => (
          <SelectItem key={label} value={String(index + 1)}>
            {label} {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AddFlowDialog({
  today,
  invoices,
  partners,
}: {
  today: string;
  invoices: Option[];
  partners: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addFlowAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-flow-button">
          <Plus /> Nouveau flux
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flux Big M CIE</DialogTitle>
          <DialogDescription>
            Entrée ou sortie de la société tête de réseau — le sens découle de
            la catégorie.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="flow-date">Date</Label>
              <Input
                id="flow-date"
                name="flowDate"
                type="date"
                required
                defaultValue={today}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select name="category" defaultValue="REDEVANCE">
                <SelectTrigger data-testid="flow-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPANY_FLOW_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-amount">Montant (€)</Label>
              <Input
                id="flow-amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="4500,00"
                data-testid="flow-amount-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-label">Libellé</Label>
              <Input id="flow-label" name="label" />
            </div>
            <div className="space-y-1.5">
              <Label>Pièce comptable liée</Label>
              <Select name="invoiceId" defaultValue="none">
                <SelectTrigger data-testid="flow-invoice-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Partenaire lié</Label>
              <Select name="partnerId" defaultValue="none">
                <SelectTrigger data-testid="flow-partner-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="flow-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFlowButton({ flowId }: { flowId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteFlowAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="flowId" value={flowId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label="Supprimer le flux"
      >
        ✕
      </Button>
    </form>
  );
}

export function SetBudgetForm({ year, month }: { year: number; month: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setBudgetAction,
    {}
  );
  useToasted(state);
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      key={state.success}
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <div className="space-y-1">
        <Label className="text-xs">Catégorie</Label>
        <Select name="category" defaultValue="REDEVANCE">
          <SelectTrigger className="w-56" data-testid="budget-category-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMPANY_FLOW_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Budget du mois (€)</Label>
        <Input
          name="amount"
          inputMode="decimal"
          required
          className="h-9 w-36"
          data-testid="budget-amount-input"
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="budget-submit">
        Enregistrer
      </Button>
    </form>
  );
}
