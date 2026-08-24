"use client";

import { useActionState, useEffect, useState } from "react";
import {
  KeyRound,
  LogIn,
  Pencil,
  Plus,
  UserRoundX,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { POLE_LABELS, ROLE_LABELS } from "@/lib/labels";

import {
  createUserAction,
  impersonateAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
  type ActionState,
} from "./actions";

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  pole: string | null;
  franchiseeId: string | null;
  franchiseeName: string | null;
  franchisorMember: boolean;
  isActive: boolean;
};

type FranchiseeOption = { id: string; companyName: string };

function useActionToast(state: ActionState, onSuccess?: () => void) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function RoleFields({
  defaults,
  franchisees,
}: {
  defaults?: Partial<UserRow>;
  franchisees: FranchiseeOption[];
}) {
  const [role, setRole] = useState(defaults?.role ?? "ANIMATION");
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Prénom</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={defaults?.firstName}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Nom</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={defaults?.lastName}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Rôle</Label>
          <Select name="role" value={role} onValueChange={setRole}>
            <SelectTrigger data-testid="role-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Pôle</Label>
          <Select name="pole" defaultValue={defaults?.pole ?? "none"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {Object.entries(POLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label
        className="flex items-start gap-2 text-sm"
        data-testid="franchisor-member-field"
      >
        <Checkbox
          name="franchisorMember"
          value="true"
          defaultChecked={defaults?.franchisorMember ?? false}
          className="mt-0.5"
        />
        <span>
          Membre de l&apos;entité FRANCHISEUR (Big M CIE)
          <span className="block text-xs text-muted-foreground">
            Donne accès aux dossiers RH rattachés au siège (avec les droits RH).
          </span>
        </span>
      </label>
      {role === "FRANCHISE" ? (
        <div className="space-y-1.5">
          <Label>Franchisé rattaché</Label>
          <Select
            name="franchiseeId"
            defaultValue={defaults?.franchiseeId ?? "none"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {franchisees.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <input type="hidden" name="franchiseeId" value="none" />
      )}
    </>
  );
}

function CreateUserDialog({ franchisees }: { franchisees: FranchiseeOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createUserAction, {});
  useActionToast(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="create-user-button">
          <Plus /> Nouvel utilisateur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Crée un compte d&apos;accès au CRM avec le rôle choisi.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe initial</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={10}
            />
          </div>
          <RoleFields franchisees={franchisees} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer l'utilisateur"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  franchisees,
}: {
  user: UserRow;
  franchisees: FranchiseeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateUserAction, {});
  useActionToast(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Modifier">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier {user.firstName} {user.lastName}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={user.id} />
          <RoleFields defaults={user} franchisees={franchisees} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(resetPasswordAction, {});
  useActionToast(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Réinitialiser le mot de passe">
          <KeyRound />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            {user.firstName} {user.lastName} devra utiliser ce nouveau mot de
            passe ; ses sessions en cours seront déconnectées.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={user.id} />
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={10}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Réinitialisation…" : "Réinitialiser"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// « Se connecter en tant que » : bascule la session sur le compte choisi
// (bannière de retour dans le layout). En cas de succès l'action redirige.
function ImpersonateButton({ user }: { user: UserRow }) {
  const [state, formAction, pending] = useActionState(impersonateAction, {});
  useActionToast(state);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={user.id} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={pending}
        title={`Se connecter en tant que ${user.firstName} ${user.lastName}`}
        data-testid={`impersonate-${user.email}`}
      >
        <LogIn />
      </Button>
    </form>
  );
}

function ToggleActiveButton({
  user,
  disabled,
}: {
  user: UserRow;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(setUserActiveAction, {});
  useActionToast(state);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="isActive" value={user.isActive ? "false" : "true"} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={disabled || pending}
        title={user.isActive ? "Désactiver le compte" : "Réactiver le compte"}
        data-testid={`toggle-active-${user.email}`}
      >
        {user.isActive ? <UserRoundX /> : <UserRoundCheck />}
      </Button>
    </form>
  );
}

export function UsersTable({
  users,
  franchisees,
  currentUserId,
  canImpersonate,
}: {
  users: UserRow[];
  franchisees: FranchiseeOption[];
  currentUserId: string;
  canImpersonate: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateUserDialog franchisees={franchisees} />
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Pôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-testid={`user-row-${u.email}`}>
                <TableCell className="font-medium">
                  {u.firstName} {u.lastName}
                  {u.franchiseeName ? (
                    <div className="text-xs text-muted-foreground">
                      {u.franchiseeName}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.pole ? POLE_LABELS[u.pole] : "—"}
                </TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Badge variant="success">Actif</Badge>
                  ) : (
                    <Badge variant="destructive">Désactivé</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canImpersonate && u.isActive && u.id !== currentUserId ? (
                    <ImpersonateButton user={u} />
                  ) : null}
                  <EditUserDialog user={u} franchisees={franchisees} />
                  <ResetPasswordDialog user={u} />
                  <ToggleActiveButton user={u} disabled={u.id === currentUserId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
