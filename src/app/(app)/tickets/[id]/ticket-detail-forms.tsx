"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addCommentAction,
  assignTicketAction,
  transitionTicketAction,
} from "../actions";

function useToastState(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

// Actions de statut proposées selon l'état courant et le rôle de l'utilisateur
// (le service revalide tout côté serveur).
function nextActions(
  status: string,
  isRequester: boolean,
  role: string
): { status: string; label: string; variant?: "default" | "outline" | "destructive" }[] {
  switch (status) {
    case "AFFECTE":
      return [{ status: "EN_COURS", label: "Commencer" }];
    case "EN_COURS":
      return [
        { status: "TERMINE", label: "Marquer terminé" },
        { status: "EN_ATTENTE", label: "Mettre en attente", variant: "outline" },
      ];
    case "EN_ATTENTE":
      return [{ status: "EN_COURS", label: "Reprendre" }];
    case "TERMINE": {
      const actions: ReturnType<typeof nextActions> = [
        { status: "EN_COURS", label: "Réouvrir", variant: "outline" },
      ];
      if (isRequester || role === "ADMIN" || role === "DIRECTION") {
        actions.unshift({ status: "VALIDE", label: "Valider" });
      }
      return actions;
    }
    default:
      return [];
  }
}

export function TransitionButtons({
  ticketId,
  status,
  isRequester,
  role,
}: {
  ticketId: string;
  status: string;
  isRequester: boolean;
  role: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionTicketAction,
    {}
  );
  useToastState(state);

  const actions = nextActions(status, isRequester, role);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <form key={action.status} action={formAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="status" value={action.status} />
          <Button
            type="submit"
            variant={action.variant ?? "default"}
            disabled={pending}
            data-testid={`transition-${action.status}`}
          >
            {action.label}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function AssignForm({
  ticketId,
  members,
  currentAssigneeId,
}: {
  ticketId: string;
  members: { id: string; label: string }[];
  currentAssigneeId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    assignTicketAction,
    {}
  );
  useToastState(state);
  const [selected, setSelected] = useState(currentAssigneeId ?? "none");

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="space-y-1.5">
        <Label>Responsable</Label>
        <Select name="assigneeId" value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-56" data-testid="assignee-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Choisir…</SelectItem>
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
        disabled={pending || selected === "none" || selected === currentAssigneeId}
        data-testid="assign-submit"
      >
        Affecter
      </Button>
    </form>
  );
}

export function CommentForm({ ticketId }: { ticketId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addCommentAction,
    {}
  );
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea
        name="body"
        rows={3}
        placeholder="Votre commentaire…"
        required
        data-testid="comment-body"
      />
      <Button type="submit" disabled={pending} data-testid="comment-submit">
        {pending ? "Envoi…" : "Commenter"}
      </Button>
    </form>
  );
}
