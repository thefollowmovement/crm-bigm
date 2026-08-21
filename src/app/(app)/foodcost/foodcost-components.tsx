"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createIngredientAction,
  createRecipeAction,
  removeRecipeItemAction,
  setPriceAction,
  setRecipeItemAction,
  setSalePriceAction,
  toggleIngredientAction,
} from "./actions";

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

export const UNIT_LABELS: Record<string, string> = {
  KG: "kg (saisie en g)",
  L: "l (saisie en ml)",
  PIECE: "pièce",
};

export function IngredientDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createIngredientAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-ingredient-button">
          <Plus /> Ingrédient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel ingrédient</DialogTitle>
          <DialogDescription>
            Les tarifs se saisissent ensuite par dépôt (ils varient par zone).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ingredient-name">Nom</Label>
            <Input id="ingredient-name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label>Unité de base</Label>
            <Select name="unit" defaultValue="KG">
              <SelectTrigger data-testid="ingredient-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="ingredient-submit"
          >
            {pending ? "Création…" : "Créer l'ingrédient"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PriceDialog({
  ingredients,
  depots,
}: {
  ingredients: Option[];
  depots: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setPriceAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="new-price-button">
          <Plus /> Tarif
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau tarif</DialogTitle>
          <DialogDescription>
            €/kg, €/l ou €/pièce selon l&apos;unité — historisé par date
            d&apos;effet, l&apos;ancien tarif est conservé.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ingrédient</Label>
            <Select name="ingredientId" required>
              <SelectTrigger data-testid="price-ingredient-select">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dépôt</Label>
              <Select name="depotId" required>
                <SelectTrigger data-testid="price-depot-select">
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
              <Label htmlFor="price-value">Tarif unitaire (€)</Label>
              <Input
                id="price-value"
                name="pricePerUnit"
                required
                inputMode="decimal"
                placeholder="8,4500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price-date">Date d&apos;effet</Label>
            <Input id="price-date" name="effectiveDate" type="date" required />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="price-submit"
          >
            {pending ? "Enregistrement…" : "Enregistrer le tarif"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleIngredientButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    toggleIngredientAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {isActive ? "Désactiver" : "Réactiver"}
      </Button>
    </form>
  );
}

export function CreateRecipeForm({ products }: { products: Option[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createRecipeAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label>Produit sans recette</Label>
        <Select name="productId" required>
          <SelectTrigger className="w-72" data-testid="recipe-product-select">
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending} data-testid="recipe-create">
        <Plus /> Créer la recette
      </Button>
    </form>
  );
}

export function RecipeItemForm({
  recipeId,
  ingredients,
}: {
  recipeId: string;
  ingredients: { id: string; label: string; unit: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setRecipeItemAction,
    {}
  );
  useToasted(state);
  const [ingredientId, setIngredientId] = useState<string>("");
  const unit = ingredients.find((i) => i.id === ingredientId)?.unit;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="recipeId" value={recipeId} />
      <div className="space-y-1.5">
        <Label>Ingrédient</Label>
        <Select name="ingredientId" value={ingredientId} onValueChange={setIngredientId}>
          <SelectTrigger className="w-56" data-testid="item-ingredient-select">
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {ingredients.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`qty-${recipeId}`}>
          Quantité{" "}
          {unit === "KG" ? "(g)" : unit === "L" ? "(ml)" : unit === "PIECE" ? "(pièces)" : ""}
        </Label>
        <Input
          id={`qty-${recipeId}`}
          name="rawQuantity"
          required
          inputMode="decimal"
          className="w-28"
          placeholder={unit === "PIECE" ? "1" : "150"}
          data-testid="item-quantity"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending} data-testid="item-submit">
        Ajouter
      </Button>
    </form>
  );
}

export function RemoveRecipeItemButton({ itemId }: { itemId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    removeRecipeItemAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="itemId" value={itemId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label="Retirer l'ingrédient"
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}

export function SalePriceForm({
  productId,
  salePriceHT,
}: {
  productId: string;
  salePriceHT: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setSalePriceAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="productId" value={productId} />
      <Input
        name="salePriceHT"
        defaultValue={salePriceHT ?? ""}
        inputMode="decimal"
        className="w-24 text-right"
        placeholder="9,50"
        aria-label="Prix de vente HT"
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        OK
      </Button>
    </form>
  );
}
