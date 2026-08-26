"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createSoftwareAction,
  setSoftwareUsersAction,
  updateSoftwareAction,
} from "./actions";

type Option = { id: string; label: string };

export type SoftwareFormValues = {
  name: string;
  purpose: string | null;
  url: string | null;
  ownerId: string | null;
  accessLevelNotes: string | null;
};

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

function SoftwareFields({
  owners,
  values,
}: {
  owners: Option[];
  values?: SoftwareFormValues;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sw-name">Nom</Label>
          <Input id="sw-name" name="name" required defaultValue={values?.name ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sw-url">Lien d&apos;accès</Label>
          <Input
            id="sw-url"
            name="url"
            placeholder="https://…"
            defaultValue={values?.url ?? ""}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="sw-purpose">Utilité</Label>
          <Input id="sw-purpose" name="purpose" defaultValue={values?.purpose ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label>Responsable</Label>
          <Select name="ownerId" defaultValue={values?.ownerId ?? "none"}>
            <SelectTrigger data-testid="sw-owner-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sw-access">Niveaux d&apos;accès (notes)</Label>
        <Textarea
          id="sw-access"
          name="accessLevelNotes"
          rows={2}
          defaultValue={values?.accessLevelNotes ?? ""}
        />
      </div>
    </>
  );
}

export function CreateSoftwareDialog({ owners }: { owners: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSoftwareAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-software-button">
          <Plus /> Nouveau logiciel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registre des logiciels</DialogTitle>
          <DialogDescription>
            Les mots de passe vont dans le coffre-fort, pas ici.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <SoftwareFields owners={owners} />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="software-submit"
          >
            {pending ? "Création…" : "Ajouter"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditSoftwareDialog({
  softwareId,
  isActive,
  owners,
  members,
  selectedUserIds,
  values,
}: {
  softwareId: string;
  isActive: boolean;
  owners: Option[];
  members: Option[];
  selectedUserIds: string[];
  values: SoftwareFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateSoftwareAction,
    {}
  );
  const [usersState, usersFormAction, usersPending] = useActionState<
    ActionState,
    FormData
  >(setSoftwareUsersAction, {});
  useToasted(state, () => setOpen(false));
  useToasted(usersState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Modifier le logiciel">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{values.name}</DialogTitle>
          <DialogDescription>
            Fiche du logiciel et personnes autorisées.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="softwareId" value={softwareId} />
          <SoftwareFields owners={owners} values={values} />
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <Select name="isActive" defaultValue={isActive ? "true" : "false"}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Utilisé</SelectItem>
                <SelectItem value="false">Décommissionné</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending} data-testid="software-update">
            {pending ? "Enregistrement…" : "Enregistrer la fiche"}
          </Button>
        </form>

        <form action={usersFormAction} className="space-y-3 border-t pt-4">
          <input type="hidden" name="softwareId" value={softwareId} />
          <Label>Personnes autorisées</Label>
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="userIds"
                  value={member.id}
                  defaultChecked={selectedUserIds.includes(member.id)}
                />
                {member.label}
              </label>
            ))}
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={usersPending}
            data-testid="software-users-submit"
          >
            {usersPending ? "Enregistrement…" : "Mettre à jour les accès"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
