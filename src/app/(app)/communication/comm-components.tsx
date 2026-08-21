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
  COMM_TASK_TYPE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addCommTaskCommentAction,
  assignCommTaskAction,
  createCommTaskAction,
  transitionCommTaskAction,
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

export function CommTaskFilters({
  current,
}: {
  current: { statut: string; type: string };
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
        value={current.statut || "tous"}
        onValueChange={(v) => setParam("statut", v)}
      >
        <SelectTrigger className="w-48" data-testid="comm-status-filter">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les statuts</SelectItem>
          {Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={current.type || "tous"} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-56" data-testid="comm-type-filter">
          <SelectValue placeholder="Tous les types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les types</SelectItem>
          {Object.entries(COMM_TASK_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreateCommTaskDialog({
  stores,
  partners,
  canWrite,
}: {
  stores: Option[];
  partners: Option[];
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCommTaskAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  const types = canWrite
    ? Object.entries(COMM_TASK_TYPE_LABELS)
    : Object.entries(COMM_TASK_TYPE_LABELS).filter(([value]) => value === "DEMANDE");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-comm-task-button">
          <Plus /> {canWrite ? "Nouvelle tâche" : "Nouvelle demande"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {canWrite ? "Nouvelle tâche communication" : "Demande au pôle communication"}
          </DialogTitle>
          <DialogDescription>
            Créations, campagnes, vidéos, réseaux sociaux, Ads — avec dates de
            publication et validation du demandeur.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="type" defaultValue="DEMANDE">
                <SelectTrigger data-testid="comm-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select name="priority" defaultValue="NORMALE">
                <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comm-title">Objet</Label>
            <Input id="comm-title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comm-description">Description</Label>
            <Textarea id="comm-description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Boutique (facultatif)</Label>
              <Select name="storeId" defaultValue="none">
                <SelectTrigger data-testid="comm-store-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Partenaire (facultatif)</Label>
              <Select name="partnerId" defaultValue="none">
                <SelectTrigger data-testid="comm-partner-select">
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
            <div className="space-y-1.5">
              <Label htmlFor="comm-due">Échéance</Label>
              <Input id="comm-due" name="dueDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comm-publication">Date de publication</Label>
              <Input id="comm-publication" name="publicationDate" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comm-files">Pièces jointes</Label>
            <Input id="comm-files" name="files" type="file" multiple />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="comm-task-submit"
          >
            {pending ? "Création…" : "Créer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignCommTaskForm({
  taskId,
  members,
  currentAssigneeId,
}: {
  taskId: string;
  members: Option[];
  currentAssigneeId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    assignCommTaskAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="space-y-1.5">
        <Label>Responsable</Label>
        <Select name="assigneeId" defaultValue={currentAssigneeId ?? undefined}>
          <SelectTrigger className="w-64" data-testid="comm-assign-select">
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="comm-assign-submit"
      >
        {pending ? "Affectation…" : "Affecter"}
      </Button>
    </form>
  );
}

export function TransitionCommTaskButtons({
  taskId,
  nextStatuses,
}: {
  taskId: string;
  nextStatuses: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionCommTaskAction,
    {}
  );
  useToasted(state);
  if (nextStatuses.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <form key={status} action={formAction}>
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="status" value={status} />
          <Button type="submit" disabled={pending} data-testid={`comm-to-${status}`}>
            {TICKET_STATUS_LABELS[status]}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function CommTaskCommentForm({ taskId }: { taskId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addCommTaskCommentAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-2" key={state.success}>
      <input type="hidden" name="taskId" value={taskId} />
      <Textarea
        name="body"
        rows={2}
        placeholder="Ajouter un commentaire…"
        required
        data-testid="comm-comment-input"
      />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="comm-comment-submit"
      >
        {pending ? "Envoi…" : "Commenter"}
      </Button>
    </form>
  );
}
