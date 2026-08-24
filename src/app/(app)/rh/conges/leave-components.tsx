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
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { cancelLeaveAction, decideLeaveAction, requestLeaveForEmployeeAction } from "../actions";

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

export function LeaveStatusFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "tous") params.delete("statut");
    else params.set("statut", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current || "tous"} onValueChange={setParam}>
      <SelectTrigger className="w-48" data-testid="leave-status-filter">
        <SelectValue placeholder="Tous les statuts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="tous">Tous les statuts</SelectItem>
        {Object.entries(LEAVE_STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Filtre boutique de la vue calendrier (« SIEGE » = salariés Big M CIE).
export function LeaveStoreFilter({
  current,
  stores,
  showSiege,
}: {
  current: string;
  stores: Option[];
  showSiege: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "toutes") params.delete("boutique");
    else params.set("boutique", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current || "toutes"} onValueChange={setParam}>
      <SelectTrigger className="w-64" data-testid="leave-store-filter">
        <SelectValue placeholder="Toutes les boutiques" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="toutes">Toutes les boutiques</SelectItem>
        {showSiege ? (
          <SelectItem value="SIEGE">Siège — Big M CIE</SelectItem>
        ) : null}
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CreateLeaveDialog({ employees }: { employees: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestLeaveForEmployeeAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-leave-button">
          <Plus /> Nouvelle demande
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demande de congés</DialogTitle>
          <DialogDescription>Saisie RH pour un salarié.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Salarié</Label>
            <Select name="employeeId">
              <SelectTrigger data-testid="leave-employee-select">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LeaveFields />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="leave-submit"
          >
            {pending ? "Envoi…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveFields() {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select name="type" defaultValue="CONGES_PAYES">
          <SelectTrigger data-testid="leave-type-select">
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
          <Label htmlFor="leave-start">Du</Label>
          <Input id="leave-start" name="startDate" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-end">Au (inclus)</Label>
          <Input id="leave-end" name="endDate" type="date" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leave-comment">Commentaire</Label>
        <Textarea id="leave-comment" name="comment" rows={2} />
      </div>
    </>
  );
}

export function DecideLeaveButtons({ leaveId }: { leaveId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    decideLeaveAction,
    {}
  );
  useToasted(state);
  return (
    <div className="flex gap-2">
      {(["VALIDEE", "REFUSEE"] as const).map((decision) => (
        <form key={decision} action={formAction}>
          <input type="hidden" name="leaveId" value={leaveId} />
          <input type="hidden" name="decision" value={decision} />
          <Button
            type="submit"
            size="sm"
            variant={decision === "VALIDEE" ? "default" : "outline"}
            disabled={pending}
            data-testid={`leave-${decision}`}
          >
            {decision === "VALIDEE" ? "Valider" : "Refuser"}
          </Button>
        </form>
      ))}
    </div>
  );
}

export function CancelLeaveButton({ leaveId }: { leaveId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    cancelLeaveAction,
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
        data-testid="leave-cancel"
      >
        Annuler
      </Button>
    </form>
  );
}
