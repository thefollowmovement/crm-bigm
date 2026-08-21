"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { LEAVE_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { cancelMyLeaveAction, clockAction, requestMyLeaveAction } from "./actions";

function useToasted(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

const CLOCK_LABELS: Record<string, string> = {
  DEBUT: "Commencer la journée",
  PAUSE: "Pause",
  REPRISE: "Reprendre",
  FIN: "Terminer la journée",
};

export function ClockButtons({ actions }: { actions: string[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    clockAction,
    {}
  );
  useToasted(state);
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <form key={action} action={formAction}>
          <input type="hidden" name="action" value={action} />
          <Button
            type="submit"
            variant={action === "FIN" ? "outline" : "default"}
            disabled={pending}
            data-testid={`clock-${action}`}
          >
            {CLOCK_LABELS[action] ?? action}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function MyLeaveForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestMyLeaveAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4" key={state.success}>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select name="type" defaultValue="CONGES_PAYES">
          <SelectTrigger data-testid="my-leave-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="my-leave-start">Du</Label>
          <Input id="my-leave-start" name="startDate" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="my-leave-end">Au (inclus)</Label>
          <Input id="my-leave-end" name="endDate" type="date" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="my-leave-comment">Commentaire</Label>
        <Textarea id="my-leave-comment" name="comment" rows={2} />
      </div>
      <Button type="submit" disabled={pending} data-testid="my-leave-submit">
        {pending ? "Envoi…" : "Demander"}
      </Button>
    </form>
  );
}

export function CancelMyLeaveButton({ leaveId }: { leaveId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    cancelMyLeaveAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="leaveId" value={leaveId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        data-testid="my-leave-cancel"
      >
        Annuler
      </Button>
    </form>
  );
}
