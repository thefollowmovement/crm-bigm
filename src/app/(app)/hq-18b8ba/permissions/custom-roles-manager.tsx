"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

import { createCustomRoleAction, deleteCustomRoleAction } from "./actions";

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

export function CustomRolesManager({
  baseRoles,
  customRoles,
}: {
  baseRoles: { value: string; label: string }[];
  customRoles: { id: string; name: string; baseRoleLabel: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [createState, createAction, createPending] = useActionState<
    ActionState,
    FormData
  >(createCustomRoleAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState<
    ActionState,
    FormData
  >(deleteCustomRoleAction, {});
  useToasted(createState, () => setOpen(false));
  useToasted(deleteState);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="new-custom-role-button">
            <Plus /> Nouveau rôle
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau rôle personnalisé</DialogTitle>
            <DialogDescription>
              Le rôle démarre avec les droits de son rôle de base ; ajustez-les
              ensuite dans sa colonne de la matrice, puis assignez-le depuis
              /hq-18b8ba/utilisateurs.
            </DialogDescription>
          </DialogHeader>
          <form action={createAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="custom-role-name">Nom du rôle</Label>
              <Input
                id="custom-role-name"
                name="name"
                required
                placeholder="Ex. Manager RH junior"
                data-testid="custom-role-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rôle de base</Label>
              <Select name="baseRole" defaultValue="ANIMATION">
                <SelectTrigger data-testid="custom-role-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baseRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-role-description">Description</Label>
              <Input
                id="custom-role-description"
                name="description"
                placeholder="Optionnel"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createPending}
              data-testid="custom-role-submit"
            >
              {createPending ? "Création…" : "Créer le rôle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {customRoles.map((role) => (
        <Badge
          key={role.id}
          variant="secondary"
          className="gap-1 py-1 pl-2.5 pr-1 text-[13px]"
          data-testid={`custom-role-chip-${role.name}`}
        >
          {role.name}
          <span className="font-normal text-muted-foreground">
            · base {role.baseRoleLabel}
          </span>
          <form action={deleteAction} className="inline-flex">
            <input type="hidden" name="customRoleId" value={role.id} />
            <button
              type="submit"
              disabled={deletePending}
              title={`Supprimer le rôle ${role.name}`}
              className="ml-1 rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
              data-testid={`delete-custom-role-${role.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </form>
        </Badge>
      ))}
    </div>
  );
}
