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
import { Textarea } from "@/components/ui/textarea";
import { VISIT_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createCriterionAction,
  createVisitAction,
  toggleCriterionAction,
} from "./actions";

type Option = { id: string; label: string };

export function VisitListFilters({
  stores,
  current,
}: {
  stores: Option[];
  current: { boutique: string; type: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "tous") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={current.boutique || "tous"}
        onValueChange={(v) => setParam("boutique", v)}
      >
        <SelectTrigger className="w-72" data-testid="visit-store-filter">
          <SelectValue placeholder="Toutes les boutiques" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Toutes les boutiques</SelectItem>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={current.type || "tous"} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-56" data-testid="visit-type-filter">
          <SelectValue placeholder="Tous les types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les types</SelectItem>
          {Object.entries(VISIT_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreateVisitDialog({ stores }: { stores: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createVisitAction,
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
        <Button data-testid="new-visit-button">
          <Plus /> Nouvelle visite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle visite terrain</DialogTitle>
          <DialogDescription>
            Créée en brouillon : notation (audits), compte rendu et pièces
            jointes se complètent ensuite sur la fiche de la visite.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Boutique</Label>
            <Select name="storeId" required>
              <SelectTrigger data-testid="visit-store-select">
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
              <Select name="type" defaultValue="AUDIT">
                <SelectTrigger data-testid="visit-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VISIT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visit-date">Date</Label>
              <Input id="visit-date" name="visitDate" type="date" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visit-report">Compte rendu (modifiable ensuite)</Label>
            <Textarea id="visit-report" name="report" rows={3} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="visit-submit"
          >
            {pending ? "Création…" : "Créer la visite"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CriterionDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCriterionAction,
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
        <Button variant="outline" size="sm" data-testid="new-criterion-button">
          <Plus /> Critère
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau critère d&apos;audit</DialogTitle>
          <DialogDescription>
            La note d&apos;un audit = somme des points obtenus / barème total.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="criterion-label">Libellé</Label>
            <Input id="criterion-label" name="label" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="criterion-category">Catégorie</Label>
              <Input
                id="criterion-category"
                name="category"
                placeholder="Hygiène, Service…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="criterion-max">Barème (points)</Label>
              <Input
                id="criterion-max"
                name="maxScore"
                inputMode="numeric"
                defaultValue="10"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="criterion-submit"
          >
            {pending ? "Ajout…" : "Ajouter le critère"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleCriterionButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    toggleCriterionAction,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
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
