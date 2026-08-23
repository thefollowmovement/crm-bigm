// Construction des DTO envoyés aux composants : les champs sensibles sont
// ABSENTS du payload selon le rôle (règle CLAUDE.md n°4 — jamais d'objet
// Drizzle brut sérialisé vers le client).
import type { franchisees, stores } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";

type StoreRow = typeof stores.$inferSelect;
type FranchiseeRow = typeof franchisees.$inferSelect;

export type StoreDTO = {
  id: string;
  code: string;
  name: string;
  type: StoreRow["type"];
  status: StoreRow["status"];
  franchiseeId: string | null;
  animateurId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  email: string | null;
  siret: string | null;
  openingDate: string | null;
  closingDate: string | null;
  // absent du payload si le rôle n'a pas store:read_internal_notes
  internalNotes?: string | null;
};

export function toStoreDTO(store: StoreRow, user: SessionUser): StoreDTO {
  const dto: StoreDTO = {
    id: store.id,
    code: store.code,
    name: store.name,
    type: store.type,
    status: store.status,
    franchiseeId: store.franchiseeId,
    animateurId: store.animateurId,
    address: store.address,
    postalCode: store.postalCode,
    city: store.city,
    region: store.region,
    latitude: store.latitude,
    longitude: store.longitude,
    phone: store.phone,
    email: store.email,
    siret: store.siret,
    openingDate: store.openingDate,
    closingDate: store.closingDate,
  };
  if (can(user, "store:read_internal_notes")) {
    dto.internalNotes = store.internalNotes;
  }
  return dto;
}

export type FranchiseeDTO = {
  id: string;
  companyName: string;
  legalForm: string | null;
  siren: string | null;
  contactFirstName: string;
  contactLastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  // notes internes siège — même règle que les notes internes boutique
  notes?: string | null;
};

export function toFranchiseeDTO(
  franchisee: FranchiseeRow,
  user: SessionUser
): FranchiseeDTO {
  const dto: FranchiseeDTO = {
    id: franchisee.id,
    companyName: franchisee.companyName,
    legalForm: franchisee.legalForm,
    siren: franchisee.siren,
    contactFirstName: franchisee.contactFirstName,
    contactLastName: franchisee.contactLastName,
    email: franchisee.email,
    phone: franchisee.phone,
    address: franchisee.address,
    postalCode: franchisee.postalCode,
    city: franchisee.city,
  };
  if (can(user, "store:read_internal_notes")) {
    dto.notes = franchisee.notes;
  }
  return dto;
}
