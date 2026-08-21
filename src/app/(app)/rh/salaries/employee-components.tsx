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
import { EMPLOYEE_CONTRACT_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createEmployeeAction,
  updateEmployeeAction,
  uploadEmployeeFilesAction,
} from "../actions";

type Option = { id: string; label: string };

export type EmployeeFormValues = {
  firstName: string;
  lastName: string;
  position: string;
  storeId: string | null;
  userId: string | null;
  email: string | null;
  phone: string | null;
  contractType: string;
  hireDate: string;
  endDate: string | null;
  salaryMonthly: string | null;
  hrNotes: string | null;
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

function EmployeeFields({
  stores,
  linkableUsers,
  values,
}: {
  stores: Option[];
  linkableUsers: Option[];
  values?: EmployeeFormValues;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="emp-firstname">Prénom</Label>
          <Input
            id="emp-firstname"
            name="firstName"
            required
            defaultValue={values?.firstName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-lastname">Nom</Label>
          <Input
            id="emp-lastname"
            name="lastName"
            required
            defaultValue={values?.lastName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-position">Poste</Label>
          <Input
            id="emp-position"
            name="position"
            required
            defaultValue={values?.position ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Contrat</Label>
          <Select name="contractType" defaultValue={values?.contractType ?? "CDI"}>
            <SelectTrigger data-testid="emp-contract-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EMPLOYEE_CONTRACT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Affectation</Label>
          <Select name="storeId" defaultValue={values?.storeId ?? "none"}>
            <SelectTrigger data-testid="emp-store-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Siège</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Compte de connexion (pointeuse)</Label>
          <Select name="userId" defaultValue={values?.userId ?? "none"}>
            <SelectTrigger data-testid="emp-user-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun</SelectItem>
              {linkableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-hiredate">Embauche</Label>
          <Input
            id="emp-hiredate"
            name="hireDate"
            type="date"
            required
            defaultValue={values?.hireDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-enddate">Fin de contrat</Label>
          <Input
            id="emp-enddate"
            name="endDate"
            type="date"
            defaultValue={values?.endDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-email">E-mail</Label>
          <Input
            id="emp-email"
            name="email"
            type="email"
            defaultValue={values?.email ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-phone">Téléphone</Label>
          <Input id="emp-phone" name="phone" defaultValue={values?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-salary">Salaire mensuel brut (€)</Label>
          <Input
            id="emp-salary"
            name="salaryMonthly"
            inputMode="decimal"
            placeholder="1801,80"
            defaultValue={values?.salaryMonthly ?? ""}
            data-testid="emp-salary-input"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="emp-hrnotes">Notes RH (internes)</Label>
        <Textarea
          id="emp-hrnotes"
          name="hrNotes"
          rows={2}
          defaultValue={values?.hrNotes ?? ""}
          data-testid="emp-hrnotes-input"
        />
      </div>
    </>
  );
}

export function CreateEmployeeDialog({
  stores,
  linkableUsers,
}: {
  stores: Option[];
  linkableUsers: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createEmployeeAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-employee-button">
          <Plus /> Nouveau salarié
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle fiche salarié</DialogTitle>
          <DialogDescription>
            Dossier RH : contrat, affectation, compte pointeuse.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <EmployeeFields stores={stores} linkableUsers={linkableUsers} />
          <Button
            type="submit"
            className="w-full"
            disabled={pending}
            data-testid="employee-submit"
          >
            {pending ? "Création…" : "Créer la fiche"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditEmployeeForm({
  employeeId,
  isActive,
  stores,
  linkableUsers,
  values,
}: {
  employeeId: string;
  isActive: boolean;
  stores: Option[];
  linkableUsers: Option[];
  values: EmployeeFormValues;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateEmployeeAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <EmployeeFields stores={stores} linkableUsers={linkableUsers} values={values} />
      <div className="space-y-1.5">
        <Label>Statut</Label>
        <Select name="isActive" defaultValue={isActive ? "true" : "false"}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Actif</SelectItem>
            <SelectItem value="false">Sorti des effectifs</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending} data-testid="employee-update">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function EmployeeDocsForm({ employeeId }: { employeeId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadEmployeeFilesAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" key={state.success}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="space-y-1.5">
        <Label htmlFor="emp-files">Ajouter au dossier</Label>
        <Input
          id="emp-files"
          name="files"
          type="file"
          multiple
          data-testid="emp-docs-input"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="emp-docs-submit"
      >
        {pending ? "Envoi…" : "Ajouter"}
      </Button>
    </form>
  );
}
