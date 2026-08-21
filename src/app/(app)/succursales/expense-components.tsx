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
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { addExpenseAction, deleteExpenseAction } from "./actions";

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

export function AddExpenseDialog({
  storeId,
  today,
}: {
  storeId: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addExpenseAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-expense-button">
          <Plus /> Nouvelle dépense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dépense de la succursale</DialogTitle>
          <DialogDescription>
            Entre dans le calcul de rentabilité mensuel.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="storeId" value={storeId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                name="expenseDate"
                type="date"
                required
                defaultValue={today}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select name="category" defaultValue="LOYER">
                <SelectTrigger data-testid="expense-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Montant (€)</Label>
              <Input
                id="exp-amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="2400,00"
                data-testid="expense-amount-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-label">Libellé</Label>
              <Input id="exp-label" name="label" placeholder="Loyer août…" />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="expense-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteExpenseButton({
  storeId,
  expenseId,
}: {
  storeId: string;
  expenseId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteExpenseAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="expenseId" value={expenseId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label="Supprimer la dépense"
      >
        ✕
      </Button>
    </form>
  );
}
