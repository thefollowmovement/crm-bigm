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
import { Textarea } from "@/components/ui/textarea";
import {
  TRAINING_STATUS_LABELS,
  TRAINING_TYPE_LABELS,
} from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addParticipantAction,
  attachTrainingDocsAction,
  createTrainingAction,
  removeParticipantAction,
  transitionTrainingAction,
  updateTrainingReportAction,
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

export function CreateTrainingDialog({
  stores,
  trainers,
}: {
  stores: Option[];
  trainers: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTrainingAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-training-button">
          <Plus /> Nouvelle formation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planifier une formation</DialogTitle>
          <DialogDescription>
            Les documents signés se rattachent automatiquement à la fiche de la
            boutique et du franchisé concernés.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Boutique</Label>
            <Select name="storeId" required>
              <SelectTrigger data-testid="training-store-select">
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
              <Select name="type" defaultValue="CONTINUE">
                <SelectTrigger data-testid="training-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRAINING_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="training-date">Date</Label>
              <Input id="training-date" name="trainingDate" type="date" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Formateur (vous par défaut)</Label>
            <Select name="trainerId">
              <SelectTrigger data-testid="training-trainer-select">
                <SelectValue placeholder="Moi-même" />
              </SelectTrigger>
              <SelectContent>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="training-notes">Notes</Label>
            <Textarea id="training-notes" name="notes" rows={2} />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="training-submit"
          >
            {pending ? "Planification…" : "Planifier"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TrainingReportForm({
  trainingId,
  report,
  notes,
}: {
  trainingId: string;
  report: string | null;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateTrainingReportAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="trainingId" value={trainingId} />
      <div className="space-y-1.5">
        <Label htmlFor="training-report">Compte rendu</Label>
        <Textarea
          id="training-report"
          name="report"
          rows={4}
          defaultValue={report ?? ""}
          data-testid="training-report-input"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="training-notes-edit">Notes</Label>
        <Textarea
          id="training-notes-edit"
          name="notes"
          rows={2}
          defaultValue={notes ?? ""}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="training-report-submit"
      >
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function TransitionTrainingButtons({
  trainingId,
  nextStatuses,
}: {
  trainingId: string;
  nextStatuses: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionTrainingAction,
    {}
  );
  useToasted(state);
  if (nextStatuses.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <form key={status} action={formAction}>
          <input type="hidden" name="trainingId" value={trainingId} />
          <input type="hidden" name="status" value={status} />
          <Button
            type="submit"
            variant={status === "ANNULEE" ? "outline" : "default"}
            disabled={pending}
            data-testid={`training-to-${status}`}
          >
            {TRAINING_STATUS_LABELS[status]}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function ParticipantForm({ trainingId }: { trainingId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addParticipantAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex items-end gap-2" key={state.success}>
      <input type="hidden" name="trainingId" value={trainingId} />
      <div className="space-y-1.5">
        <Label htmlFor={`participant-${trainingId}`}>Nom du participant</Label>
        <Input
          id={`participant-${trainingId}`}
          name="name"
          required
          className="w-64"
          data-testid="participant-input"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="participant-submit"
      >
        <Plus /> Ajouter
      </Button>
    </form>
  );
}

export function RemoveParticipantButton({ participantId }: { participantId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    removeParticipantAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="participantId" value={participantId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label="Retirer le participant"
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}

export function TrainingDocsForm({ trainingId }: { trainingId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    attachTrainingDocsAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="trainingId" value={trainingId} />
      <div className="space-y-1.5">
        <Label htmlFor={`docs-${trainingId}`}>Documents</Label>
        <Input
          id={`docs-${trainingId}`}
          name="files"
          type="file"
          multiple
          className="w-72"
          data-testid="training-docs-input"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Nature</Label>
        <Select name="kind" defaultValue="REMIS">
          <SelectTrigger className="w-48" data-testid="training-docs-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="REMIS">Document remis</SelectItem>
            <SelectItem value="SIGNE">Document signé</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="training-docs-submit"
      >
        {pending ? "Envoi…" : "Rattacher"}
      </Button>
    </form>
  );
}
