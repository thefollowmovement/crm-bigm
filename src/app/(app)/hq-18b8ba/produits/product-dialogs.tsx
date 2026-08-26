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
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createFamilyAction,
  createProductAction,
  toggleFamilyAction,
  toggleProductAction,
} from "./actions";

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

export function CreateFamilyDialog() {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(createFamilyAction, () =>
    setOpen(false)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="new-family-button">
          <Plus /> Nouvelle famille
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle famille de produits</DialogTitle>
          <DialogDescription>
            Regroupe les produits pour les analyses de ventes (ex. Burgers,
            Boissons, Desserts).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="family-name">Nom</Label>
            <Input id="family-name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="family-order">Ordre d&apos;affichage</Label>
            <Input
              id="family-order"
              name="displayOrder"
              inputMode="numeric"
              placeholder="0"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="family-submit"
          >
            {pending ? "Création…" : "Créer la famille"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProductDialog({
  families,
}: {
  families: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { formAction, pending } = useToastedState(createProductAction, () =>
    setOpen(false)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-product-button">
          <Plus /> Nouveau produit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau produit</DialogTitle>
          <DialogDescription>
            Le code sert de clé dans les imports CSV de ventes (ex. BURGER-XL).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-code">Code</Label>
              <Input id="product-code" name="code" required placeholder="BURGER-XL" />
            </div>
            <div className="space-y-1.5">
              <Label>Famille</Label>
              <Select name="familyId" required>
                <SelectTrigger data-testid="product-family-select">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Nom</Label>
            <Input id="product-name" name="name" required />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="product-submit"
          >
            {pending ? "Création…" : "Créer le produit"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleActiveButton({
  kind,
  id,
  isActive,
}: {
  kind: "family" | "product";
  id: string;
  isActive: boolean;
}) {
  const { formAction, pending } = useToastedState(
    kind === "family" ? toggleFamilyAction : toggleProductAction
  );
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
