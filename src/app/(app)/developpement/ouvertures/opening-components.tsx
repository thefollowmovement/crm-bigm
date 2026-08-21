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
import { Textarea } from "@/components/ui/textarea";
import {
  CHECKLIST_STATUS_LABELS,
  OPENING_PROJECT_STATUS_LABELS,
  OPENING_STEP_STATUS_LABELS,
  POLE_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addChecklistItemAction,
  attachStepFilesAction,
  createProjectAction,
  deleteChecklistItemAction,
  setChecklistItemStatusAction,
  transitionStepAction,
  updateProjectAction,
  updateStepAction,
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

export function CreateProjectDialog({ stores }: { stores: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createProjectAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-opening-button">
          <Plus /> Nouveau projet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Projet d&apos;ouverture</DialogTitle>
          <DialogDescription>
            Réservé aux boutiques franchisées « En projet » — les 8 jalons du
            parcours sont générés automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Boutique en projet</Label>
            <Select name="storeId">
              <SelectTrigger data-testid="opening-store-select">
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
            <Label htmlFor="opening-target">Ouverture visée</Label>
            <Input id="opening-target" name="targetOpeningDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opening-notes">Notes</Label>
            <Textarea id="opening-notes" name="notes" rows={2} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="opening-submit"
          >
            {pending ? "Création…" : "Créer le projet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditProjectForm({
  projectId,
  values,
}: {
  projectId: string;
  values: { status: string; targetOpeningDate: string | null; notes: string | null };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProjectAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select name="status" defaultValue={values.status}>
            <SelectTrigger data-testid="project-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(OPENING_PROJECT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-target">Ouverture visée</Label>
          <Input
            id="project-target"
            name="targetOpeningDate"
            type="date"
            defaultValue={values.targetOpeningDate ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-notes">Notes</Label>
        <Textarea
          id="project-notes"
          name="notes"
          rows={2}
          defaultValue={values.notes ?? ""}
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="project-update">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function StepTransitionButtons({
  projectId,
  stepId,
  nextStatuses,
}: {
  projectId: string;
  stepId: string;
  nextStatuses: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionStepAction,
    {}
  );
  useToasted(state);
  if (nextStatuses.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <form key={status} action={formAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="stepId" value={stepId} />
          <input type="hidden" name="status" value={status} />
          <Button
            type="submit"
            size="sm"
            variant={status === "TERMINEE" ? "default" : "outline"}
            disabled={pending}
            data-testid={`step-to-${status}`}
          >
            {OPENING_STEP_STATUS_LABELS[status]}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function StepPlanForm({
  projectId,
  stepId,
  plannedDate,
  notes,
}: {
  projectId: string;
  stepId: string;
  plannedDate: string | null;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateStepAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stepId" value={stepId} />
      <div className="space-y-1">
        <Label className="text-xs">Date prévue</Label>
        <Input
          name="plannedDate"
          type="date"
          defaultValue={plannedDate ?? ""}
          className="h-8 w-40"
          data-testid="step-planned-input"
        />
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label className="text-xs">Notes</Label>
        <Input name="notes" defaultValue={notes ?? ""} className="h-8" />
      </div>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        data-testid="step-plan-submit"
      >
        OK
      </Button>
    </form>
  );
}

export function StepFilesForm({
  projectId,
  stepId,
}: {
  projectId: string;
  stepId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    attachStepFilesAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex items-center gap-2" key={state.success}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stepId" value={stepId} />
      <Input name="files" type="file" multiple className="h-8 max-w-64" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Envoi…" : "Joindre"}
      </Button>
    </form>
  );
}

export function AddChecklistItemForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addChecklistItemAction,
    {}
  );
  useToasted(state);
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      key={state.success}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="min-w-56 flex-1 space-y-1">
        <Label className="text-xs">Nouvel item</Label>
        <Input name="label" required data-testid="checklist-label-input" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Pôle</Label>
        <Select name="pole" defaultValue="DEVELOPPEMENT">
          <SelectTrigger className="h-9 w-48" data-testid="checklist-pole-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(POLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Échéance</Label>
        <Input name="dueDate" type="date" className="h-9 w-40" />
      </div>
      <Button type="submit" disabled={pending} data-testid="checklist-add-submit">
        <Plus /> Ajouter
      </Button>
    </form>
  );
}

export function ChecklistStatusSelect({
  projectId,
  itemId,
  status,
  disabled,
}: {
  projectId: string;
  itemId: string;
  status: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setChecklistItemStatusAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Select
        name="status"
        defaultValue={status}
        disabled={disabled}
        onValueChange={(value) => {
          const data = new FormData();
          data.set("projectId", projectId);
          data.set("itemId", itemId);
          data.set("status", value);
          formAction(data);
        }}
      >
        <SelectTrigger className="h-8 w-36" data-testid="checklist-status-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CHECKLIST_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}

export function DeleteChecklistItemButton({
  projectId,
  itemId,
}: {
  projectId: string;
  itemId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteChecklistItemAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label="Supprimer l'item"
      >
        ✕
      </Button>
    </form>
  );
}
