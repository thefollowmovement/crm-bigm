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
import {
  ACTION_PLAN_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { createPlanAction } from "./actions";

type Option = { id: string; label: string };

export function PlanListFilters({
  stores,
  current,
}: {
  stores: Option[];
  current: { boutique: string; statut: string };
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
        <SelectTrigger className="w-72" data-testid="plan-store-filter">
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
      <Select
        value={current.statut || "tous"}
        onValueChange={(v) => setParam("statut", v)}
      >
        <SelectTrigger className="w-48" data-testid="plan-status-filter">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les statuts</SelectItem>
          {Object.entries(ACTION_PLAN_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreatePlanDialog({
  stores,
  assignees,
  defaultStoreId,
  visitId,
}: {
  stores: Option[];
  assignees: Option[];
  defaultStoreId?: string;
  visitId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPlanAction,
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
        <Button data-testid="new-plan-button">
          <Plus /> Nouveau plan d&apos;action
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau plan d&apos;action</DialogTitle>
          <DialogDescription>
            Responsable, priorité, échéance — suivi jusqu&apos;à validation.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {visitId ? <input type="hidden" name="visitId" value={visitId} /> : null}
          <div className="space-y-1.5">
            <Label>Boutique</Label>
            <Select name="storeId" defaultValue={defaultStoreId} required>
              <SelectTrigger data-testid="plan-store-select">
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
          <div className="space-y-1.5">
            <Label htmlFor="plan-title">Titre</Label>
            <Input id="plan-title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea id="plan-description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select name="priority" defaultValue="NORMALE">
                <SelectTrigger data-testid="plan-priority-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-due">Échéance</Label>
              <Input id="plan-due" name="dueDate" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select name="assigneeId">
              <SelectTrigger data-testid="plan-assignee-select">
                <SelectValue placeholder="À affecter plus tard" />
              </SelectTrigger>
              <SelectContent>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-files">Photos / documents</Label>
            <Input id="plan-files" name="files" type="file" multiple />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="plan-submit"
          >
            {pending ? "Création…" : "Créer le plan d'action"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
