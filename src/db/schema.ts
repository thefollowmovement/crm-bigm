// Schéma de données du CRM Big M.
// Conventions :
// - ids : uuid générés par Postgres (gen_random_uuid)
// - montants : numeric(12,2) — le driver pg renvoie des strings (jamais de float)
// - dates civiles (échéances, CA journalier) : date — strings "YYYY-MM-DD"
// - horodatages : timestamptz
import { relations } from "drizzle-orm";
import {
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
    role: roleEnum("role").notNull(),
    pole: poleEnum("pole"),
    franchiseeId: uuid("franchisee_id").references(() => franchisees.id),
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
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
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
    address: text("address"),
    postalCode: text("postal_code"),
    city: text("city"),
    region: text("region"),
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

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    category: documentCategoryEnum("category").notNull(),
    notes: text("notes"),
    // vide = visible de tous les rôles siège
    visibleToRoles: roleEnum("visible_to_roles").array().notNull().default([]),
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
  sessions: many(sessions),
  managedStores: many(stores),
  notifications: many(notifications),
}));

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
}));

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
