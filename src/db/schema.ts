// Schéma de données du CRM Big M.
// Conventions :
// - ids : uuid générés par Postgres (gen_random_uuid)
// - montants : numeric(12,2) — le driver pg renvoie des strings (jamais de float)
// - dates civiles (échéances, CA journalier) : date — strings "YYYY-MM-DD"
// - horodatages : timestamptz
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// ─────────────── ENUMS ───────────────

export const roleEnum = pgEnum("role", [
  "ADMIN",
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
  "FRANCHISE",
  // valeurs ajoutées EN FIN de tableau uniquement (ALTER TYPE … ADD VALUE)
  // SALARIE : accès pointeuse + congés uniquement (users.pole reste null)
  "SALARIE",
]);

export const poleEnum = pgEnum("pole", [
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
]);

export const storeTypeEnum = pgEnum("store_type", ["FRANCHISE", "SUCCURSALE"]);

export const storeStatusEnum = pgEnum("store_status", [
  "EN_PROJET",
  "OUVERTE",
  "FERMEE_TEMPORAIREMENT",
  "FERMEE",
]);

export const platformTypeEnum = pgEnum("platform_type", [
  "UBER_EATS",
  "DELIVEROO",
  "JUST_EAT",
  "AUTRE",
]);

export const contractTypeEnum = pgEnum("contract_type", [
  "CONTRAT_FRANCHISE",
  "DIP",
  "AVENANT",
  "BAIL",
  "AUTRE",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "BROUILLON",
  "ACTIF",
  "EXPIRE",
  "RESILIE",
  "RENOUVELE",
]);

export const documentCategoryEnum = pgEnum("document_category", [
  "JURIDIQUE",
  "PROCEDURE",
  "RH",
  "COMPTABILITE",
  "COMMUNICATION",
  "FORMATION",
  "MARKETING",
  "AUTRE",
]);

export const exchangeTypeEnum = pgEnum("exchange_type", [
  "DEMANDE",
  "LITIGE",
  "DECISION",
  "INFORMATION",
]);

export const exchangeStatusEnum = pgEnum("exchange_status", [
  "OUVERT",
  "EN_COURS",
  "RESOLU",
  "CLOS",
]);

export const revenueChannelEnum = pgEnum("revenue_channel", [
  "SUR_PLACE",
  "EMPORTE",
  "TABLETTE",
  "UBER_EATS",
  "DELIVEROO",
  "AUTRE",
]);

export const revenueSourceEnum = pgEnum("revenue_source", ["SAISIE", "IMPORT_CSV"]);

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "DROIT_ENTREE",
  "REDEVANCE",
  "REDEVANCE_COMMUNICATION",
  "AUTRE",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "EMISE",
  "PARTIELLEMENT_PAYEE",
  "PAYEE",
  "ANNULEE",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "VIREMENT",
  "PRELEVEMENT",
  "CHEQUE",
  "CB",
  "ESPECES",
  "AUTRE",
]);

export const reminderChannelEnum = pgEnum("reminder_channel", [
  "EMAIL",
  "TELEPHONE",
  "COURRIER",
  "LRAR",
  "AUTRE",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "NOUVEAU",
  "AFFECTE",
  "EN_COURS",
  "EN_ATTENTE",
  "TERMINE",
  "VALIDE",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "BASSE",
  "NORMALE",
  "HAUTE",
  "CRITIQUE",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "CONTRAT_ECHEANCE",
  "FACTURE_IMPAYEE",
  "TICKET",
  "ECHANGE",
  "DOCUMENT",
  "SYSTEME",
  // valeurs ajoutées EN FIN de tableau uniquement (ALTER TYPE … ADD VALUE)
  "VISITE",
  "PLAN_ACTION",
  "PLANNING",
  "ALERTE",
  "FORMATION",
  "COMMUNICATION",
  "RH",
  "OUVERTURE",
  "DEVELOPPEMENT",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "DOWNLOAD",
  "IMPORT",
  // valeurs ajoutées EN FIN de tableau uniquement (ALTER TYPE … ADD VALUE)
  // REVEAL : révélation d'un secret du coffre-fort (étape 27)
  "REVEAL",
  // IMPERSONATE : connexion « en tant que » par un administrateur (étape 28)
  "IMPERSONATE",
]);

export const attachmentEntityEnum = pgEnum("attachment_entity", [
  "CONTRACT",
  "EXCHANGE_MESSAGE",
  "TICKET",
  "TICKET_COMMENT",
  "REMINDER",
  "STORE",
  "FRANCHISEE",
  "DOCUMENT_VERSION",
  // valeurs ajoutées EN FIN de tableau uniquement (ALTER TYPE … ADD VALUE)
  "STORE_VISIT",
  "ACTION_PLAN",
  "TRAINING",
  "COMM_TASK",
  "PARTNER",
  "EMPLOYEE",
  "OPENING_STEP",
  "PROSPECT",
  "PREMISES",
  // STORE_PHOTO : photo de la fiche boutique (étape 29)
  "STORE_PHOTO",
]);

// ─────────────── ANIMATION TERRAIN (étape 14) ───────────────

export const visitTypeEnum = pgEnum("visit_type", [
  "AUDIT",
  "VISITE_COURTOISIE",
  "OUVERTURE",
  "FORMATION",
  "NOUVEAU_PRODUIT",
  "INTERVENTION",
]);

export const visitStatusEnum = pgEnum("visit_status", ["BROUILLON", "FINALISEE"]);

export const actionPlanStatusEnum = pgEnum("action_plan_status", [
  "A_FAIRE",
  "EN_COURS",
  "TERMINE",
  "VALIDE",
  "ANNULE",
]);

export const planPeriodEnum = pgEnum("plan_period", [
  "MATIN",
  "APRES_MIDI",
  "JOURNEE",
]);

export const planActivityEnum = pgEnum("plan_activity", [
  "VISITE",
  "AUDIT",
  "FORMATION",
  "OUVERTURE",
  "REUNION",
  "TRAJET",
  "AUTRE",
]);

// ─────────────── AUTH & UTILISATEURS ───────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    role: roleEnum("role").notNull(),
    pole: poleEnum("pole"),
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id),
    // Membre de l'entité FRANCHISEUR « Big M CIE » (étape 34) : seul un membre
    // (ou un ADMIN) voit les dossiers RH rattachés au siège.
    franchisorMember: boolean("franchisor_member").notNull().default(false),
    // Rôle personnalisé (étape 35) : affine `role` (son rôle de base) par des
    // écarts de permissions propres.
    customRoleId: uuid("custom_role_id").references(
      (): AnyPgColumn => customRoles.id
    ),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_role_idx").on(t.role),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    // id = hash SHA-256 du token (le token en clair ne touche jamais la base)
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    // Renseigné quand un admin est connecté « en tant que » userId (étape 28).
    impersonatorUserId: uuid("impersonator_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

// ─────────────── RÔLES PERSONNALISÉS (étape 35) ───────────────

// Un rôle personnalisé = un rôle de base (jamais ADMIN) + des écarts de
// permissions propres. Assignable à un utilisateur (users.customRoleId) ;
// les écarts du rôle personnalisé priment sur ceux du rôle de base.
export const customRoles = pgTable(
  "custom_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    baseRole: roleEnum("base_role").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("custom_roles_name_unique").on(t.name)]
);

export const customRolePermissions = pgTable(
  "custom_role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customRoleId: uuid("custom_role_id")
      .notNull()
      .references(() => customRoles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    allowed: boolean("allowed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("custom_role_permissions_role_permission_unique").on(
      t.customRoleId,
      t.permission
    ),
  ]
);

// ─────────────── SAUVEGARDES DE LA BASE (étape 33) ───────────────

export const backupKindEnum = pgEnum("backup_kind", ["MANUEL", "PLANIFIE"]);
export const backupStatusEnum = pgEnum("backup_status", [
  "EN_COURS",
  "OK",
  "ERREUR",
]);
export const backupRemoteStatusEnum = pgEnum("backup_remote_status", [
  "ENVOYE",
  "ERREUR",
]);

// Une ligne par pg_dump (fichier `filename` dans BACKUP_DIR). L'envoi FTP
// optionnel est tracé séparément : un échec distant n'invalide pas la
// sauvegarde locale.
export const backups = pgTable(
  "backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: text("filename").notNull(),
    kind: backupKindEnum("kind").notNull(),
    status: backupStatusEnum("status").notNull().default("EN_COURS"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    error: text("error"),
    remoteStatus: backupRemoteStatusEnum("remote_status"),
    remoteError: text("remote_error"),
    // null = job planifié
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("backups_filename_unique").on(t.filename)]
);

export const backupsRelations = relations(backups, ({ one }) => ({
  createdBy: one(users, {
    fields: [backups.createdById],
    references: [users.id],
  }),
}));

// ─────────────── DROITS D'ACCÈS DYNAMIQUES (étape 30) ───────────────

// Écarts par rapport à la matrice statique de src/lib/authz/permissions.ts :
// une ligne = « pour CE rôle, CETTE permission vaut allowed » (accordée ou
// retirée à chaud par l'admin). Le rôle ADMIN n'est jamais restreint.
export const permissionOverrides = pgTable(
  "permission_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: roleEnum("role").notNull(),
    permission: text("permission").notNull(),
    allowed: boolean("allowed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("permission_overrides_role_permission_unique").on(
      t.role,
      t.permission
    ),
  ]
);

// ─────────────── BOUTIQUES & FRANCHISÉS ───────────────

export const franchisees = pgTable("franchisees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  legalForm: text("legal_form"),
  siren: text("siren").unique(),
  contactFirstName: text("contact_first_name").notNull(),
  contactLastName: text("contact_last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  // Visible siège uniquement (retiré des DTO rôle FRANCHISE)
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Identifiant réseau, ex. "BM-021"
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: storeTypeEnum("type").notNull(),
    status: storeStatusEnum("status").notNull().default("EN_PROJET"),
    // null si succursale
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id),
    // animateur réseau responsable
    animateurId: uuid("animateur_id").references(() => users.id),
    // dépôt DPS qui approvisionne la boutique (Food Cost par zone)
    depotId: uuid("depot_id").references(() => depots.id),
    address: text("address"),
    postalCode: text("postal_code"),
    city: text("city"),
    region: text("region"),
    // Coordonnées GPS (lien/carte OpenStreetMap sur la fiche)
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    phone: text("phone"),
    email: text("email"),
    siret: text("siret"),
    openingDate: date("opening_date"),
    closingDate: date("closing_date"),
    // Invisible rôle FRANCHISE
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("stores_code_unique").on(t.code),
    index("stores_type_status_idx").on(t.type, t.status),
    index("stores_animateur_idx").on(t.animateurId),
    index("stores_franchisee_idx").on(t.franchiseeId),
  ]
);

export const storePlatforms = pgTable(
  "store_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    platform: platformTypeEnum("platform").notNull(),
    // libellé si AUTRE
    label: text("label"),
    // identifiant du restaurant sur la plateforme
    accountRef: text("account_ref"),
    isActive: boolean("is_active").notNull().default(true),
    activatedAt: date("activated_at"),
  },
  (t) => [uniqueIndex("store_platforms_store_platform_unique").on(t.storeId, t.platform)]
);

// ─────────────── CONTRATS ───────────────

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id),
    type: contractTypeEnum("type").notNull(),
    status: contractStatusEnum("status").notNull().default("BROUILLON"),
    // n° interne
    reference: text("reference"),
    signedAt: date("signed_at"),
    startDate: date("start_date"),
    // base de l'alerte de fin de contrat
    endDate: date("end_date"),
    alertMonthsBefore: integer("alert_months_before").notNull().default(6),
    // idempotence du cron d'alerte
    expiryAlertSentAt: timestamp("expiry_alert_sent_at", { withTimezone: true }),
    // avenant → contrat parent
    parentContractId: uuid("parent_contract_id").references(
      (): AnyPgColumn => contracts.id
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("contracts_store_idx").on(t.storeId),
    index("contracts_end_date_status_idx").on(t.endDate, t.status),
  ]
);

// ─────────────── FICHIERS ───────────────

export const fileAttachments = pgTable(
  "file_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // intégrité + dédoublonnage
    sha256: text("sha256").notNull(),
    // chemin relatif à UPLOAD_DIR : "2026/08/<uuid>.pdf"
    storagePath: text("storage_path").notNull(),
    // rattachement polymorphe (null pour une version de document :
    // la relation directe est portée par document_versions.file_id)
    entityType: attachmentEntityEnum("entity_type"),
    entityId: uuid("entity_id"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("file_attachments_storage_path_unique").on(t.storagePath),
    index("file_attachments_entity_idx").on(t.entityType, t.entityId),
  ]
);

// ─────────────── BIBLIOTHÈQUE DOCUMENTAIRE ───────────────

// Dossiers de classement (étape 32) : arborescence libre (parentId), création
// réservée à la permission document:folder (pilotable via /admin/permissions).
export const documentFolders = pgTable(
  "document_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => documentFolders.id
    ),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Unicité du nom au même niveau (racine et sous-dossiers séparés,
    // NULL n'étant jamais égal à NULL dans un index unique classique).
    uniqueIndex("document_folders_root_name_unique")
      .on(t.name)
      .where(sql`parent_id is null`),
    uniqueIndex("document_folders_parent_name_unique")
      .on(t.parentId, t.name)
      .where(sql`parent_id is not null`),
  ]
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    category: documentCategoryEnum("category").notNull(),
    notes: text("notes"),
    // vide = visible de tous les rôles siège
    visibleToRoles: roleEnum("visible_to_roles").array().notNull().default([]),
    // null = racine de la bibliothèque
    folderId: uuid("folder_id").references(() => documentFolders.id, {
      onDelete: "set null",
    }),
    isArchived: boolean("is_archived").notNull().default(false),
    currentVersionId: uuid("current_version_id").references(
      (): AnyPgColumn => documentVersions.id
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("documents_category_idx").on(t.category, t.isArchived)]
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileAttachments.id),
    // « pourquoi cette version »
    changeNote: text("change_note"),
    // date d'applicabilité
    effectiveDate: date("effective_date"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_versions_doc_version_unique").on(t.documentId, t.versionNumber),
    uniqueIndex("document_versions_file_unique").on(t.fileId),
  ]
);

// ─────────────── ÉCHANGES FRANCHISÉS ───────────────

export const exchanges = pgTable(
  "exchanges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    type: exchangeTypeEnum("type").notNull(),
    status: exchangeStatusEnum("status").notNull().default("OUVERT"),
    subject: text("subject").notNull(),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("exchanges_store_status_idx").on(t.storeId, t.status),
    index("exchanges_type_status_idx").on(t.type, t.status),
  ]
);

export const exchangeMessages = pgTable(
  "exchange_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => exchanges.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    // marque une décision officielle
    isDecision: boolean("is_decision").notNull().default(false),
    // note interne invisible rôle FRANCHISE
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // PJ via file_attachments(entity_type: EXCHANGE_MESSAGE, entity_id: id)
  },
  (t) => [index("exchange_messages_exchange_idx").on(t.exchangeId, t.createdAt)]
);

// ─────────────── FINANCES ───────────────

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "F2026-0042" — séquence gérée par le service en transaction
    number: text("number").notNull(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    type: invoiceTypeEnum("type").notNull(),
    // ex. "Redevance juillet 2026"
    label: text("label"),
    // période couverte (redevances)
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    amountHT: numeric("amount_ht", { precision: 12, scale: 2 }).notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("20.00"),
    amountTTC: numeric("amount_ttc", { precision: 12, scale: 2 }).notNull(),
    issuedAt: date("issued_at").notNull(),
    dueDate: date("due_date").notNull(),
    // EN_RETARD est dérivé (due_date dépassée), jamais stocké
    status: invoiceStatusEnum("status").notNull().default("EMISE"),
    // idempotence du cron de retards
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("invoices_number_unique").on(t.number),
    index("invoices_store_status_idx").on(t.storeId, t.status),
    index("invoices_due_date_status_idx").on(t.dueDate, t.status),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paidAt: date("paid_at").notNull(),
    method: paymentMethodEnum("method").notNull(),
    // n° de virement…
    reference: text("reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)]
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    // 1, 2, 3 (mise en demeure)
    level: integer("level").notNull(),
    channel: reminderChannelEnum("channel").notNull(),
    sentAt: date("sent_at").notNull(),
    sentById: uuid("sent_by_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // PJ (courrier scanné) via file_attachments(entity_type: REMINDER)
  },
  (t) => [index("reminders_invoice_idx").on(t.invoiceId, t.level)]
);

// ─────────────── CHIFFRE D'AFFAIRES ───────────────

export const revenueEntries = pgTable(
  "revenue_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    date: date("date").notNull(),
    channel: revenueChannelEnum("channel").notNull(),
    // libellé si AUTRE
    channelLabel: text("channel_label"),
    // brut (TTC plateforme)
    grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
    // net (après commission) — canaux de livraison
    netAmount: numeric("net_amount", { precision: 12, scale: 2 }),
    // nombre de commandes du jour sur ce canal (panier moyen dérivé en SQL)
    orderCount: integer("order_count"),
    source: revenueSourceEnum("source").notNull().default("SAISIE"),
    enteredById: uuid("entered_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // idempotence de l'import CSV (upsert)
    uniqueIndex("revenue_entries_store_date_channel_unique").on(
      t.storeId,
      t.date,
      t.channel
    ),
    index("revenue_entries_store_date_idx").on(t.storeId, t.date),
    index("revenue_entries_date_idx").on(t.date),
  ]
);

// ─────────────── PRODUITS & VENTES ───────────────

export const productFamilies = pgTable(
  "product_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("product_families_name_unique").on(t.name)]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // clé métier des imports CSV, ex. "BURGER-XL"
    code: text("code").notNull(),
    name: text("name").notNull(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => productFamilies.id),
    // prix de vente HT (pour le % de coût matière du Food Cost)
    salePriceHT: numeric("sale_price_ht", { precision: 12, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("products_code_unique").on(t.code),
    index("products_family_idx").on(t.familyId),
  ]
);

export const productSales = pgTable(
  "product_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    date: date("date").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    // CA du produit sur la journée (facultatif dans les exports caisse)
    amount: numeric("amount", { precision: 12, scale: 2 }),
    source: revenueSourceEnum("source").notNull().default("SAISIE"),
    enteredById: uuid("entered_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // idempotence de l'import CSV (upsert)
    uniqueIndex("product_sales_store_date_product_unique").on(
      t.storeId,
      t.date,
      t.productId
    ),
    index("product_sales_store_date_idx").on(t.storeId, t.date),
    index("product_sales_product_date_idx").on(t.productId, t.date),
  ]
);

// ─────────────── VISITES TERRAIN & PLANS D'ACTION ───────────────

// Grille d'audit paramétrable : la note (%) est TOUJOURS dérivée en SQL
// (SUM(score)/SUM(maxScore)), jamais stockée.
export const auditCriteria = pgTable("audit_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  // regroupement libre (Hygiène, Service, Tenue du point de vente…)
  category: text("category"),
  maxScore: integer("max_score").notNull().default(10),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const storeVisits = pgTable(
  "store_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    type: visitTypeEnum("type").notNull(),
    status: visitStatusEnum("status").notNull().default("BROUILLON"),
    visitDate: date("visit_date").notNull(),
    visitedById: uuid("visited_by_id")
      .notNull()
      .references(() => users.id),
    // compte rendu (obligatoire pour finaliser)
    report: text("report"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("store_visits_store_date_idx").on(t.storeId, t.visitDate),
    index("store_visits_visitor_idx").on(t.visitedById, t.visitDate),
    index("store_visits_type_date_idx").on(t.type, t.visitDate),
  ]
);

export const auditItems = pgTable(
  "audit_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => storeVisits.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => auditCriteria.id),
    score: integer("score").notNull(),
    isCompliant: boolean("is_compliant").notNull().default(true),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("audit_items_visit_criterion_unique").on(t.visitId, t.criterionId)]
);

export const actionPlans = pgTable(
  "action_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // numéro court affiché "PA-000123"
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    // visite d'origine (audit) le cas échéant
    visitId: uuid("visit_id").references(() => storeVisits.id),
    title: text("title").notNull(),
    description: text("description"),
    priority: ticketPriorityEnum("priority").notNull().default("NORMALE"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    dueDate: date("due_date"),
    status: actionPlanStatusEnum("status").notNull().default("A_FAIRE"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    // marqueur du job de relance (idempotence)
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("action_plans_number_unique").on(t.number),
    index("action_plans_store_status_idx").on(t.storeId, t.status),
    index("action_plans_assignee_status_idx").on(t.assigneeId, t.status),
    index("action_plans_due_status_idx").on(t.dueDate, t.status),
  ]
);

export const actionPlanComments = pgTable(
  "action_plan_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => actionPlans.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("action_plan_comments_plan_idx").on(t.planId)]
);

// ─────────────── COMMUNICATION & PARTENAIRES ───────────────

export const commTaskTypeEnum = pgEnum("comm_task_type", [
  "DEMANDE",
  "CREATION",
  "CAMPAGNE",
  "VIDEO",
  "RESEAUX_SOCIAUX",
  "ADS",
  "AUTRE",
]);

// Fiche partenaire / prestataire (cdc §11).
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  // domaine d'intervention (print, vidéo, réseaux sociaux…)
  domain: text("domain"),
  tariffNotes: text("tariff_notes"),
  // champ d'action
  scopeNotes: text("scope_notes"),
  // SENSIBLE : réservé aux détenteurs de partner:write (absent des DTO sinon)
  internalNotes: text("internal_notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const partnerStores = pgTable(
  "partner_stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("partner_stores_unique").on(t.partnerId, t.storeId)]
);

// Tâches du pôle communication (cdc §10) — même machine à états que les
// tickets (statuts/priorités réutilisés).
export const commTasks = pgTable(
  "comm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // numéro court affiché "COM-000123"
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    type: commTaskTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    storeId: uuid("store_id").references(() => stores.id),
    partnerId: uuid("partner_id").references(() => partners.id),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    assigneeId: uuid("assignee_id").references(() => users.id),
    priority: ticketPriorityEnum("priority").notNull().default("NORMALE"),
    status: ticketStatusEnum("status").notNull().default("NOUVEAU"),
    dueDate: date("due_date"),
    // date de publication / livraison (cdc §10)
    publicationDate: date("publication_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    // marqueur du job de relance (idempotence)
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("comm_tasks_number_unique").on(t.number),
    index("comm_tasks_assignee_status_idx").on(t.assigneeId, t.status),
    index("comm_tasks_status_due_idx").on(t.status, t.dueDate),
    index("comm_tasks_publication_idx").on(t.publicationDate),
    index("comm_tasks_requester_idx").on(t.requesterId),
  ]
);

export const commTaskComments = pgTable(
  "comm_task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => commTasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comm_task_comments_task_idx").on(t.taskId)]
);

// ─────────────── FORMATIONS ───────────────

export const trainingTypeEnum = pgEnum("training_type", [
  "INITIALE",
  "CONTINUE",
  "OUVERTURE",
  "NOUVEAU_PRODUIT",
  "HYGIENE",
  "AUTRE",
]);

export const trainingStatusEnum = pgEnum("training_status", [
  "PLANIFIEE",
  "REALISEE",
  "VALIDEE",
  "ANNULEE",
]);

export const trainingDocKindEnum = pgEnum("training_doc_kind", ["REMIS", "SIGNE"]);

export const trainings = pgTable(
  "trainings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    // franchisé concerné (rattachement automatique des documents signés)
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id),
    type: trainingTypeEnum("type").notNull(),
    status: trainingStatusEnum("status").notNull().default("PLANIFIEE"),
    trainingDate: date("training_date").notNull(),
    // compte rendu (obligatoire pour passer à RÉALISÉE)
    report: text("report"),
    notes: text("notes"),
    validatedById: uuid("validated_by_id").references(() => users.id),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("trainings_store_date_idx").on(t.storeId, t.trainingDate),
    index("trainings_trainer_idx").on(t.trainerId),
    index("trainings_franchisee_idx").on(t.franchiseeId),
  ]
);

// Participants en texte libre : les salariés des franchisés ne sont pas en base.
export const trainingParticipants = pgTable(
  "training_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainingId: uuid("training_id")
      .notNull()
      .references(() => trainings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("training_participants_training_idx").on(t.trainingId)]
);

// Documents remis / signés — le « rattachement automatique » aux fiches
// boutique et franchisé est une lecture via trainings.storeId/franchiseeId.
export const trainingDocuments = pgTable(
  "training_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainingId: uuid("training_id")
      .notNull()
      .references(() => trainings.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileAttachments.id),
    kind: trainingDocKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("training_documents_file_unique").on(t.fileId),
    index("training_documents_training_idx").on(t.trainingId),
  ]
);

// ─────────────── FOOD COST ───────────────

// Unité de base d'un ingrédient : l'UI saisit en g/ml et convertit, la base
// stocke toujours en KG / L / PIECE (quantités numeric(12,4) string).
export const ingredientUnitEnum = pgEnum("ingredient_unit", ["KG", "L", "PIECE"]);

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    unit: ingredientUnitEnum("unit").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("ingredients_name_unique").on(t.name)]
);

// Tarif d'un ingrédient PAR DÉPÔT, historisé par date d'effet : le prix
// applicable à une date est le dernier effectiveDate <= date. numeric(12,4)
// car c'est un tarif unitaire (€/kg…), pas un montant affiché.
export const ingredientPrices = pgTable(
  "ingredient_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    depotId: uuid("depot_id")
      .notNull()
      .references(() => depots.id),
    pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 4 }).notNull(),
    effectiveDate: date("effective_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ingredient_prices_unique").on(t.ingredientId, t.depotId, t.effectiveDate),
    index("ingredient_prices_lookup_idx").on(t.depotId, t.ingredientId, t.effectiveDate),
  ]
);

// Une recette par produit du référentiel (cdc §6).
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("recipes_product_unique").on(t.productId)]
);

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    // quantité en unité de base (kg / l / pièce)
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("recipe_items_unique").on(t.recipeId, t.ingredientId)]
);

// ─────────────── ACHATS DPS (dépôts d'approvisionnement) ───────────────

// Dépôt DPS : les tarifs (Food Cost, étape 18) varient par dépôt.
export const depots = pgTable(
  "depots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ex. "DPS-LYON"
    code: text("code").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("depots_code_unique").on(t.code)]
);

export const dpsPurchases = pgTable(
  "dps_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    depotId: uuid("depot_id")
      .notNull()
      .references(() => depots.id),
    date: date("date").notNull(),
    // n° de bon de livraison / facture DPS — clé d'idempotence des imports
    reference: text("reference").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    source: revenueSourceEnum("source").notNull().default("SAISIE"),
    enteredById: uuid("entered_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("dps_purchases_store_date_ref_unique").on(t.storeId, t.date, t.reference),
    index("dps_purchases_store_date_idx").on(t.storeId, t.date),
    index("dps_purchases_depot_date_idx").on(t.depotId, t.date),
    index("dps_purchases_date_idx").on(t.date),
  ]
);

// ─────────────── PLANNINGS DES ANIMATEURS ───────────────

// Fiche animateur (cdc §7 : zone, itinéraire théorique, coût kilométrique).
export const animatorProfiles = pgTable(
  "animator_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    zone: text("zone"),
    theoreticalRoute: text("theoretical_route"),
    // €/km pour l'estimation de coût des tournées (string numeric)
    costPerKm: numeric("cost_per_km", { precision: 6, scale: 3 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("animator_profiles_user_unique").on(t.userId)]
);

// Une entrée = (animateur, jour, créneau). JOURNEE est exclusif du reste
// (règle vérifiée par le service).
export const animatorPlanEntries = pgTable(
  "animator_plan_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    animateurId: uuid("animateur_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    period: planPeriodEnum("period").notNull(),
    activity: planActivityEnum("activity").notNull(),
    storeId: uuid("store_id").references(() => stores.id),
    // libellé libre (réunion réseau, salon…)
    label: text("label"),
    kmEstimated: numeric("km_estimated", { precision: 6, scale: 1 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("animator_plan_entries_slot_unique").on(t.animateurId, t.date, t.period),
    index("animator_plan_entries_animateur_date_idx").on(t.animateurId, t.date),
  ]
);

// ─────────────── RH (étape 21) ───────────────

export const employeeContractTypeEnum = pgEnum("employee_contract_type", [
  "CDI",
  "CDD",
  "APPRENTISSAGE",
  "STAGE",
  "EXTRA",
]);

export const leaveTypeEnum = pgEnum("leave_type", [
  "CONGES_PAYES",
  "SANS_SOLDE",
  "MALADIE",
  "FAMILIAL",
  "AUTRE",
]);

export const leaveStatusEnum = pgEnum("leave_status", [
  "DEMANDEE",
  "VALIDEE",
  "REFUSEE",
  "ANNULEE",
]);

export const clockEntryTypeEnum = pgEnum("clock_entry_type", ["TRAVAIL", "PAUSE"]);

// Fiches salariés (cdc §12). salaryMonthly et hrNotes sont SENSIBLES :
// absents des DTO pour qui n'a pas hr:read (field-visibility, règle n°4).
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // compte de connexion lié (pointeuse / congés en self-service)
    userId: uuid("user_id").references(() => users.id),
    // null = siège, sinon boutique (succursale ou franchise en propre)
    storeId: uuid("store_id").references(() => stores.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    position: text("position").notNull(),
    email: text("email"),
    phone: text("phone"),
    contractType: employeeContractTypeEnum("contract_type").notNull(),
    hireDate: date("hire_date").notNull(),
    endDate: date("end_date"),
    salaryMonthly: numeric("salary_monthly", { precision: 12, scale: 2 }),
    hrNotes: text("hr_notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("employees_user_unique").on(t.userId),
    index("employees_store_idx").on(t.storeId),
  ]
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    // dates civiles incluses (endDate >= startDate, gardé par le service)
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    comment: text("comment"),
    status: leaveStatusEnum("status").notNull().default("DEMANDEE"),
    decidedById: uuid("decided_by_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionComment: text("decision_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("leave_requests_employee_start_idx").on(t.employeeId, t.startDate),
    index("leave_requests_status_idx").on(t.status),
  ]
);

// Pointeuse : intervalles TRAVAIL / PAUSE. Un seul badge ouvert par salarié
// (index unique partiel sur ended_at is null) — cdc §12 : actions explicites,
// la connexion à l'outil ne vaut pas temps de travail.
export const clockEntries = pgTable(
  "clock_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: clockEntryTypeEnum("type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("clock_entries_one_open_unique")
      .on(t.employeeId)
      .where(sql`ended_at is null`),
    index("clock_entries_employee_started_idx").on(t.employeeId, t.startedAt),
  ]
);

// ─────────────── OUVERTURES DE FRANCHISE (étape 22) ───────────────

// Les 8 jalons types du parcours d'ouverture (cdc §13), générés à la
// création du projet dans cet ordre.
export const openingStepTypeEnum = pgEnum("opening_step_type", [
  "DIP",
  "CONTRAT",
  "TRAVAUX",
  "FORMATION",
  "COMMANDES",
  "INSTALLATION",
  "OUVERTURE",
  "SUIVI_J30",
]);

export const openingStepStatusEnum = pgEnum("opening_step_status", [
  "A_VENIR",
  "EN_COURS",
  "TERMINEE",
  "BLOQUEE",
]);

export const openingProjectStatusEnum = pgEnum("opening_project_status", [
  "EN_COURS",
  "TERMINE",
  "ABANDONNE",
]);

// « en retard » se dérive de dueDate < aujourd'hui — jamais stocké.
export const checklistStatusEnum = pgEnum("checklist_status", [
  "A_FAIRE",
  "EN_ATTENTE",
  "BLOQUE",
  "TERMINE",
]);

export const openingProjects = pgTable(
  "opening_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // une boutique (type FRANCHISE, statut EN_PROJET à la création) = un projet
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    status: openingProjectStatusEnum("status").notNull().default("EN_COURS"),
    targetOpeningDate: date("target_opening_date"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("opening_projects_store_unique").on(t.storeId)]
);

export const openingSteps = pgTable(
  "opening_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => openingProjects.id, { onDelete: "cascade" }),
    step: openingStepTypeEnum("step").notNull(),
    status: openingStepStatusEnum("status").notNull().default("A_VENIR"),
    plannedDate: date("planned_date"),
    doneDate: date("done_date"),
    notes: text("notes"),
    // marqueur du job opening-late (idempotence)
    lateAlertSentAt: timestamp("late_alert_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("opening_steps_project_step_unique").on(t.projectId, t.step),
    index("opening_steps_status_planned_idx").on(t.status, t.plannedDate),
  ]
);

// Checklist collaborative : chaque pôle coche ses items (cdc §13).
export const openingChecklistItems = pgTable(
  "opening_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => openingProjects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    pole: poleEnum("pole").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueDate: date("due_date"),
    status: checklistStatusEnum("status").notNull().default("A_FAIRE"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("opening_checklist_project_idx").on(t.projectId, t.pole)]
);

// ─────────────── PROSPECTION & CESSIONS (étape 23) ───────────────

// Pipeline candidats franchisés (cdc §14). Transitions libres : chaque
// changement de statut journalise un événement STATUT.
export const prospectStatusEnum = pgEnum("prospect_status", [
  "NOUVEAU",
  "CONTACTE",
  "QUALIFIE",
  "RDV",
  "DIP",
  "RECHERCHE_LOCAL",
  "CONTRAT",
  "OUVERTURE",
  "ABANDONNE",
]);

export const interestLevelEnum = pgEnum("interest_level", ["FAIBLE", "MOYEN", "FORT"]);

export const prospectEventTypeEnum = pgEnum("prospect_event_type", [
  "APPEL",
  "EMAIL",
  "RDV",
  "COURRIER",
  "STATUT",
  "NOTE",
]);

export const premisesStatusEnum = pgEnum("premises_status", [
  "DISPONIBLE",
  "EN_NEGOCIATION",
  "RETENU",
  "ECARTE",
]);

export const resaleWishEnum = pgEnum("resale_wish", [
  "VENTE_TOTALE",
  "VENTE_PARTIELLE",
  "RECHERCHE_ASSOCIE",
]);

export const resaleStatusEnum = pgEnum("resale_status", [
  "ACTIVE",
  "SUSPENDUE",
  "CONCLUE",
  "ANNULEE",
]);

// Agents immobiliers partenaires de la recherche de locaux.
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  agency: text("agency"),
  email: text("email"),
  phone: text("phone"),
  zone: text("zone"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    targetZone: text("target_zone"),
    budget: numeric("budget", { precision: 12, scale: 2 }),
    personalContribution: numeric("personal_contribution", {
      precision: 12,
      scale: 2,
    }),
    leadSource: text("lead_source"),
    interestLevel: interestLevelEnum("interest_level"),
    status: prospectStatusEnum("status").notNull().default("NOUVEAU"),
    agentId: uuid("agent_id").references(() => agents.id),
    assigneeId: uuid("assignee_id").references(() => users.id),
    nextFollowUpDate: date("next_follow_up_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("prospects_status_idx").on(t.status),
    index("prospects_follow_up_idx").on(t.nextFollowUpDate),
  ]
);

export const prospectEvents = pgTable(
  "prospect_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    type: prospectEventTypeEnum("type").notNull(),
    eventDate: date("event_date").notNull(),
    notes: text("notes"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prospect_events_prospect_idx").on(t.prospectId, t.eventDate)]
);

// Base de locaux commerciaux (photos via PJ PREMISES).
export const premises = pgTable(
  "premises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    postalCode: text("postal_code"),
    surfaceM2: numeric("surface_m2", { precision: 7, scale: 1 }),
    monthlyRent: numeric("monthly_rent", { precision: 12, scale: 2 }),
    leaseRights: numeric("lease_rights", { precision: 12, scale: 2 }),
    status: premisesStatusEnum("status").notNull().default("DISPONIBLE"),
    agentId: uuid("agent_id").references(() => agents.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("premises_status_idx").on(t.status)]
);

// Franchisés vendeurs / recherche d'associé (cdc §14) — module réservé
// au développement et à la direction (resale:*), invisible du reste.
export const resaleListings = pgTable(
  "resale_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    wish: resaleWishEnum("wish").notNull(),
    askingPrice: numeric("asking_price", { precision: 12, scale: 2 }),
    urgency: ticketPriorityEnum("urgency").notNull().default("NORMALE"),
    status: resaleStatusEnum("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("resale_listings_status_idx").on(t.status)]
);

// ─────────────── SUCCURSALES : DÉPENSES (étape 24) ───────────────

export const expenseCategoryEnum = pgEnum("expense_category", [
  "LOYER",
  "SALAIRES",
  "CHARGES_SOCIALES",
  "FOURNISSEURS",
  "ENERGIE",
  "MAINTENANCE",
  "BANQUE",
  "IMPOTS",
  "AUTRE",
]);

// Dépenses des boutiques en propre (type SUCCURSALE, gardé par le service).
// Le P&L mensuel se DÉRIVE : CA − achats DPS − dépenses par catégorie.
export const storeExpenses = pgTable(
  "store_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    expenseDate: date("expense_date").notNull(),
    category: expenseCategoryEnum("category").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    label: text("label"),
    enteredById: uuid("entered_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("store_expenses_store_date_idx").on(t.storeId, t.expenseDate),
    index("store_expenses_category_idx").on(t.category),
  ]
);

// ─────────────── BIG M CIE : FLUX & BUDGETS (étape 25) ───────────────

// 12 catégories du tableau financier de la tête de réseau (cdc §5).
// Le sens (entrée/sortie) se DÉRIVE de la catégorie via la map pure
// CATEGORY_DIRECTION du service — jamais stocké.
export const companyFlowCategoryEnum = pgEnum("company_flow_category", [
  // entrées
  "DROIT_ENTREE",
  "REDEVANCE",
  "REDEVANCE_COMMUNICATION",
  "PRESTATION",
  "AUTRE_ENTREE",
  // sorties
  "PARTENAIRES",
  "COMMUNICATION",
  "SALAIRES",
  "LOGICIELS",
  "PRESTATAIRES",
  "FRAIS_GENERAUX",
  "AUTRE_SORTIE",
]);

export const companyFlows = pgTable(
  "company_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowDate: date("flow_date").notNull(),
    category: companyFlowCategoryEnum("category").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    label: text("label"),
    // rapprochement d'une facture réseau (redevances encaissées)
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    // dépense liée à un partenaire / prestataire
    partnerId: uuid("partner_id").references(() => partners.id),
    enteredById: uuid("entered_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("company_flows_date_idx").on(t.flowDate),
    index("company_flows_category_date_idx").on(t.category, t.flowDate),
  ]
);

export const companyBudgets = pgTable(
  "company_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    // 1 à 12 (gardé par le service)
    month: integer("month").notNull(),
    category: companyFlowCategoryEnum("category").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("company_budgets_unique").on(t.year, t.month, t.category),
  ]
);

// ─────────────── LOGICIELS & COFFRE-FORT (étape 27) ───────────────

// Registre des logiciels du réseau (cdc §21) : qui utilise quoi, à quel
// niveau d'accès.
export const softwareRegistry = pgTable("software_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  purpose: text("purpose"),
  url: text("url"),
  // responsable interne de l'outil
  ownerId: uuid("owner_id").references(() => users.id),
  accessLevelNotes: text("access_level_notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const softwareUsers = pgTable(
  "software_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    softwareId: uuid("software_id")
      .notNull()
      .references(() => softwareRegistry.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    accessLevel: text("access_level"),
  },
  (t) => [uniqueIndex("software_users_unique").on(t.softwareId, t.userId)]
);

// Coffre-fort : `encrypted` = "v1:<iv>:<tag>:<cipher>" (AES-256-GCM, clé
// VAULT_KEY en env). Jamais de clair en base ; le champ est aussi exclu des
// snapshots d'audit (SENSITIVE_FIELDS d'audited.ts). Révélation À L'UNITÉ,
// journalisée avec l'action REVEAL.
export const vaultSecrets = pgTable("vault_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  username: text("username"),
  url: text("url"),
  encrypted: text("encrypted").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─────────────── TICKETS INTER-PÔLES ───────────────

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // numéro court affiché "T-000123"
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    storeId: uuid("store_id").references(() => stores.id),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    fromPole: poleEnum("from_pole").notNull(),
    // service destinataire
    toPole: poleEnum("to_pole").notNull(),
    // responsable désigné
    assigneeId: uuid("assignee_id").references(() => users.id),
    priority: ticketPriorityEnum("priority").notNull().default("NORMALE"),
    status: ticketStatusEnum("status").notNull().default("NOUVEAU"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tickets_number_unique").on(t.number),
    index("tickets_to_pole_status_idx").on(t.toPole, t.status),
    index("tickets_assignee_status_idx").on(t.assigneeId, t.status),
    index("tickets_store_idx").on(t.storeId),
  ]
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_comments_ticket_idx").on(t.ticketId, t.createdAt)]
);

// ─────────────── NOTIFICATIONS ───────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    // route interne, ex. "/boutiques/xxx"
    link: text("link"),
    // ex. "contract-expiry:<contractId>" — rend les jobs rejouables
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_user_dedupe_unique").on(t.userId, t.dedupeKey),
    index("notifications_user_read_idx").on(t.userId, t.readAt, t.createdAt),
  ]
);

// ─────────────── AUDIT ───────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null = système (cron)
    userId: uuid("user_id").references(() => users.id),
    action: auditActionEnum("action").notNull(),
    // "stores", "invoices"…
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    // UPDATE : { champ: { old, new } } — champs modifiés uniquement
    changes: jsonb("changes"),
    // CREATE/DELETE : état complet (champs sensibles filtrés)
    snapshot: jsonb("snapshot"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_record_idx").on(t.tableName, t.recordId),
    index("audit_logs_user_idx").on(t.userId, t.createdAt),
    index("audit_logs_created_idx").on(t.createdAt),
  ]
);

// ─────────────── RELATIONS ───────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  franchisee: one(franchisees, {
    fields: [users.franchiseeId],
    references: [franchisees.id],
  }),
  customRole: one(customRoles, {
    fields: [users.customRoleId],
    references: [customRoles.id],
  }),
  sessions: many(sessions),
  managedStores: many(stores),
  notifications: many(notifications),
}));

export const customRolesRelations = relations(customRoles, ({ many }) => ({
  permissions: many(customRolePermissions),
  users: many(users),
}));

export const customRolePermissionsRelations = relations(
  customRolePermissions,
  ({ one }) => ({
    customRole: one(customRoles, {
      fields: [customRolePermissions.customRoleId],
      references: [customRoles.id],
    }),
  })
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const franchiseesRelations = relations(franchisees, ({ many }) => ({
  stores: many(stores),
  users: many(users),
  contracts: many(contracts),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  franchisee: one(franchisees, {
    fields: [stores.franchiseeId],
    references: [franchisees.id],
  }),
  animateur: one(users, { fields: [stores.animateurId], references: [users.id] }),
  depot: one(depots, { fields: [stores.depotId], references: [depots.id] }),
  platforms: many(storePlatforms),
  contracts: many(contracts),
  exchanges: many(exchanges),
  invoices: many(invoices),
  revenueEntries: many(revenueEntries),
  tickets: many(tickets),
}));

export const storePlatformsRelations = relations(storePlatforms, ({ one }) => ({
  store: one(stores, { fields: [storePlatforms.storeId], references: [stores.id] }),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  store: one(stores, { fields: [contracts.storeId], references: [stores.id] }),
  franchisee: one(franchisees, {
    fields: [contracts.franchiseeId],
    references: [franchisees.id],
  }),
  parentContract: one(contracts, {
    fields: [contracts.parentContractId],
    references: [contracts.id],
    relationName: "amendments",
  }),
  amendments: many(contracts, { relationName: "amendments" }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  currentVersion: one(documentVersions, {
    fields: [documents.currentVersionId],
    references: [documentVersions.id],
    relationName: "currentVersion",
  }),
  versions: many(documentVersions, { relationName: "versions" }),
  folder: one(documentFolders, {
    fields: [documents.folderId],
    references: [documentFolders.id],
  }),
}));

export const documentFoldersRelations = relations(
  documentFolders,
  ({ one, many }) => ({
    parent: one(documentFolders, {
      fields: [documentFolders.parentId],
      references: [documentFolders.id],
      relationName: "folderTree",
    }),
    children: many(documentFolders, { relationName: "folderTree" }),
    documents: many(documents),
  })
);

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
    relationName: "versions",
  }),
  file: one(fileAttachments, {
    fields: [documentVersions.fileId],
    references: [fileAttachments.id],
  }),
  uploadedBy: one(users, {
    fields: [documentVersions.uploadedById],
    references: [users.id],
  }),
}));

export const fileAttachmentsRelations = relations(fileAttachments, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [fileAttachments.uploadedById],
    references: [users.id],
  }),
}));

export const exchangesRelations = relations(exchanges, ({ one, many }) => ({
  store: one(stores, { fields: [exchanges.storeId], references: [stores.id] }),
  createdBy: one(users, { fields: [exchanges.createdById], references: [users.id] }),
  messages: many(exchangeMessages),
}));

export const exchangeMessagesRelations = relations(exchangeMessages, ({ one }) => ({
  exchange: one(exchanges, {
    fields: [exchangeMessages.exchangeId],
    references: [exchanges.id],
  }),
  author: one(users, { fields: [exchangeMessages.authorId], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  store: one(stores, { fields: [invoices.storeId], references: [stores.id] }),
  payments: many(payments),
  reminders: many(reminders),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  invoice: one(invoices, { fields: [reminders.invoiceId], references: [invoices.id] }),
  sentBy: one(users, { fields: [reminders.sentById], references: [users.id] }),
}));

export const revenueEntriesRelations = relations(revenueEntries, ({ one }) => ({
  store: one(stores, { fields: [revenueEntries.storeId], references: [stores.id] }),
  enteredBy: one(users, {
    fields: [revenueEntries.enteredById],
    references: [users.id],
  }),
}));

export const productFamiliesRelations = relations(productFamilies, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  family: one(productFamilies, {
    fields: [products.familyId],
    references: [productFamilies.id],
  }),
  sales: many(productSales),
}));

export const productSalesRelations = relations(productSales, ({ one }) => ({
  store: one(stores, { fields: [productSales.storeId], references: [stores.id] }),
  product: one(products, {
    fields: [productSales.productId],
    references: [products.id],
  }),
  enteredBy: one(users, {
    fields: [productSales.enteredById],
    references: [users.id],
  }),
}));

export const auditCriteriaRelations = relations(auditCriteria, ({ many }) => ({
  items: many(auditItems),
}));

export const storeVisitsRelations = relations(storeVisits, ({ one, many }) => ({
  store: one(stores, { fields: [storeVisits.storeId], references: [stores.id] }),
  visitedBy: one(users, {
    fields: [storeVisits.visitedById],
    references: [users.id],
  }),
  items: many(auditItems),
  actionPlans: many(actionPlans),
}));

export const auditItemsRelations = relations(auditItems, ({ one }) => ({
  visit: one(storeVisits, {
    fields: [auditItems.visitId],
    references: [storeVisits.id],
  }),
  criterion: one(auditCriteria, {
    fields: [auditItems.criterionId],
    references: [auditCriteria.id],
  }),
}));

export const actionPlansRelations = relations(actionPlans, ({ one, many }) => ({
  store: one(stores, { fields: [actionPlans.storeId], references: [stores.id] }),
  visit: one(storeVisits, {
    fields: [actionPlans.visitId],
    references: [storeVisits.id],
  }),
  assignee: one(users, {
    fields: [actionPlans.assigneeId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [actionPlans.createdById],
    references: [users.id],
  }),
  comments: many(actionPlanComments),
}));

export const actionPlanCommentsRelations = relations(
  actionPlanComments,
  ({ one }) => ({
    plan: one(actionPlans, {
      fields: [actionPlanComments.planId],
      references: [actionPlans.id],
    }),
    author: one(users, {
      fields: [actionPlanComments.authorId],
      references: [users.id],
    }),
  })
);

export const depotsRelations = relations(depots, ({ many }) => ({
  stores: many(stores),
  purchases: many(dpsPurchases),
  ingredientPrices: many(ingredientPrices),
}));

export const partnersRelations = relations(partners, ({ many }) => ({
  stores: many(partnerStores),
  tasks: many(commTasks),
}));

export const partnerStoresRelations = relations(partnerStores, ({ one }) => ({
  partner: one(partners, {
    fields: [partnerStores.partnerId],
    references: [partners.id],
  }),
  store: one(stores, { fields: [partnerStores.storeId], references: [stores.id] }),
}));

export const commTasksRelations = relations(commTasks, ({ one, many }) => ({
  store: one(stores, { fields: [commTasks.storeId], references: [stores.id] }),
  partner: one(partners, {
    fields: [commTasks.partnerId],
    references: [partners.id],
  }),
  requester: one(users, {
    fields: [commTasks.requesterId],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [commTasks.assigneeId],
    references: [users.id],
  }),
  comments: many(commTaskComments),
}));

export const commTaskCommentsRelations = relations(commTaskComments, ({ one }) => ({
  task: one(commTasks, {
    fields: [commTaskComments.taskId],
    references: [commTasks.id],
  }),
  author: one(users, {
    fields: [commTaskComments.authorId],
    references: [users.id],
  }),
}));

export const trainingsRelations = relations(trainings, ({ one, many }) => ({
  store: one(stores, { fields: [trainings.storeId], references: [stores.id] }),
  franchisee: one(franchisees, {
    fields: [trainings.franchiseeId],
    references: [franchisees.id],
  }),
  trainer: one(users, { fields: [trainings.trainerId], references: [users.id] }),
  validatedBy: one(users, {
    fields: [trainings.validatedById],
    references: [users.id],
  }),
  participants: many(trainingParticipants),
  documents: many(trainingDocuments),
}));

export const trainingParticipantsRelations = relations(
  trainingParticipants,
  ({ one }) => ({
    training: one(trainings, {
      fields: [trainingParticipants.trainingId],
      references: [trainings.id],
    }),
  })
);

export const trainingDocumentsRelations = relations(trainingDocuments, ({ one }) => ({
  training: one(trainings, {
    fields: [trainingDocuments.trainingId],
    references: [trainings.id],
  }),
  file: one(fileAttachments, {
    fields: [trainingDocuments.fileId],
    references: [fileAttachments.id],
  }),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  prices: many(ingredientPrices),
  recipeItems: many(recipeItems),
}));

export const ingredientPricesRelations = relations(ingredientPrices, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [ingredientPrices.ingredientId],
    references: [ingredients.id],
  }),
  depot: one(depots, {
    fields: [ingredientPrices.depotId],
    references: [depots.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  product: one(products, { fields: [recipes.productId], references: [products.id] }),
  items: many(recipeItems),
}));

export const recipeItemsRelations = relations(recipeItems, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeItems.recipeId], references: [recipes.id] }),
  ingredient: one(ingredients, {
    fields: [recipeItems.ingredientId],
    references: [ingredients.id],
  }),
}));

export const dpsPurchasesRelations = relations(dpsPurchases, ({ one }) => ({
  store: one(stores, { fields: [dpsPurchases.storeId], references: [stores.id] }),
  depot: one(depots, { fields: [dpsPurchases.depotId], references: [depots.id] }),
  enteredBy: one(users, {
    fields: [dpsPurchases.enteredById],
    references: [users.id],
  }),
}));

export const animatorProfilesRelations = relations(animatorProfiles, ({ one }) => ({
  user: one(users, { fields: [animatorProfiles.userId], references: [users.id] }),
}));

export const animatorPlanEntriesRelations = relations(
  animatorPlanEntries,
  ({ one }) => ({
    animateur: one(users, {
      fields: [animatorPlanEntries.animateurId],
      references: [users.id],
    }),
    store: one(stores, {
      fields: [animatorPlanEntries.storeId],
      references: [stores.id],
    }),
  })
);

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  store: one(stores, { fields: [tickets.storeId], references: [stores.id] }),
  requester: one(users, {
    fields: [tickets.requesterId],
    references: [users.id],
    relationName: "requester",
  }),
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
    relationName: "assignee",
  }),
  comments: many(ticketComments),
}));

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketComments.ticketId], references: [tickets.id] }),
  author: one(users, { fields: [ticketComments.authorId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  store: one(stores, { fields: [employees.storeId], references: [stores.id] }),
  leaveRequests: many(leaveRequests),
  clockEntries: many(clockEntries),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
  decidedBy: one(users, {
    fields: [leaveRequests.decidedById],
    references: [users.id],
  }),
}));

export const clockEntriesRelations = relations(clockEntries, ({ one }) => ({
  employee: one(employees, {
    fields: [clockEntries.employeeId],
    references: [employees.id],
  }),
}));

export const openingProjectsRelations = relations(openingProjects, ({ one, many }) => ({
  store: one(stores, { fields: [openingProjects.storeId], references: [stores.id] }),
  createdBy: one(users, {
    fields: [openingProjects.createdById],
    references: [users.id],
  }),
  steps: many(openingSteps),
  checklistItems: many(openingChecklistItems),
}));

export const openingStepsRelations = relations(openingSteps, ({ one }) => ({
  project: one(openingProjects, {
    fields: [openingSteps.projectId],
    references: [openingProjects.id],
  }),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  prospects: many(prospects),
  premises: many(premises),
}));

export const prospectsRelations = relations(prospects, ({ one, many }) => ({
  agent: one(agents, { fields: [prospects.agentId], references: [agents.id] }),
  assignee: one(users, { fields: [prospects.assigneeId], references: [users.id] }),
  events: many(prospectEvents),
}));

export const prospectEventsRelations = relations(prospectEvents, ({ one }) => ({
  prospect: one(prospects, {
    fields: [prospectEvents.prospectId],
    references: [prospects.id],
  }),
  createdBy: one(users, {
    fields: [prospectEvents.createdById],
    references: [users.id],
  }),
}));

export const premisesRelations = relations(premises, ({ one }) => ({
  agent: one(agents, { fields: [premises.agentId], references: [agents.id] }),
}));

export const resaleListingsRelations = relations(resaleListings, ({ one }) => ({
  store: one(stores, { fields: [resaleListings.storeId], references: [stores.id] }),
}));

export const softwareRegistryRelations = relations(
  softwareRegistry,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [softwareRegistry.ownerId],
      references: [users.id],
    }),
    users: many(softwareUsers),
  })
);

export const softwareUsersRelations = relations(softwareUsers, ({ one }) => ({
  software: one(softwareRegistry, {
    fields: [softwareUsers.softwareId],
    references: [softwareRegistry.id],
  }),
  user: one(users, { fields: [softwareUsers.userId], references: [users.id] }),
}));

export const companyFlowsRelations = relations(companyFlows, ({ one }) => ({
  invoice: one(invoices, {
    fields: [companyFlows.invoiceId],
    references: [invoices.id],
  }),
  partner: one(partners, {
    fields: [companyFlows.partnerId],
    references: [partners.id],
  }),
  enteredBy: one(users, {
    fields: [companyFlows.enteredById],
    references: [users.id],
  }),
}));

export const storeExpensesRelations = relations(storeExpenses, ({ one }) => ({
  store: one(stores, { fields: [storeExpenses.storeId], references: [stores.id] }),
  enteredBy: one(users, {
    fields: [storeExpenses.enteredById],
    references: [users.id],
  }),
}));

export const openingChecklistItemsRelations = relations(
  openingChecklistItems,
  ({ one }) => ({
    project: one(openingProjects, {
      fields: [openingChecklistItems.projectId],
      references: [openingProjects.id],
    }),
    assignee: one(users, {
      fields: [openingChecklistItems.assigneeId],
      references: [users.id],
    }),
  })
);
