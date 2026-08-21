"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_PLAN_STATUS_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addPlanCommentAction,
  assignPlanAction,
  transitionPlanAction,
} from "../actions";

function useToasted(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

export function AssignPlanForm({
  planId,
  assignees,
  currentAssigneeId,
}: {
  planId: string;
  assignees: { id: string; label: string }[];
  currentAssigneeId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    assignPlanAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="planId" value={planId} />
      <div className="space-y-1.5">
        <Label>Responsable</Label>
        <Select name="assigneeId" defaultValue={currentAssigneeId ?? undefined}>
          <SelectTrigger className="w-64" data-testid="plan-assign-select">
            <SelectValue placeholder="Choisir…" />
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
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="plan-assign-submit"
      >
        {pending ? "Affectation…" : "Affecter"}
      </Button>
    </form>
  );
}

export function TransitionPlanButtons({
  planId,
  nextStatuses,
}: {
  planId: string;
  nextStatuses: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionPlanAction,
    {}
  );
  useToasted(state);
  if (nextStatuses.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <form key={status} action={formAction}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="status" value={status} />
          <Button
            type="submit"
            variant={status === "ANNULE" ? "outline" : "default"}
            disabled={pending}
            data-testid={`plan-to-${status}`}
          >
            {ACTION_PLAN_STATUS_LABELS[status]}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function PlanCommentForm({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addPlanCommentAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-2" key={state.success}>
      <input type="hidden" name="planId" value={planId} />
      <Textarea
        name="body"
        rows={2}
        placeholder="Ajouter un commentaire…"
        required
        data-testid="plan-comment-input"
      />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="plan-comment-submit"
      >
        {pending ? "Envoi…" : "Commenter"}
      </Button>
    </form>
  );
}
