CREATE TYPE "public"."attachment_entity" AS ENUM('CONTRACT', 'EXCHANGE_MESSAGE', 'TICKET', 'TICKET_COMMENT', 'REMINDER', 'STORE', 'FRANCHISEE', 'DOCUMENT_VERSION');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'DOWNLOAD', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('BROUILLON', 'ACTIF', 'EXPIRE', 'RESILIE', 'RENOUVELE');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('CONTRAT_FRANCHISE', 'DIP', 'AVENANT', 'BAIL', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('JURIDIQUE', 'PROCEDURE', 'RH', 'COMPTABILITE', 'COMMUNICATION', 'FORMATION', 'MARKETING', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."exchange_status" AS ENUM('OUVERT', 'EN_COURS', 'RESOLU', 'CLOS');--> statement-breakpoint
CREATE TYPE "public"."exchange_type" AS ENUM('DEMANDE', 'LITIGE', 'DECISION', 'INFORMATION');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('EMISE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'ANNULEE');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('DROIT_ENTREE', 'REDEVANCE', 'REDEVANCE_COMMUNICATION', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('CONTRAT_ECHEANCE', 'FACTURE_IMPAYEE', 'TICKET', 'ECHANGE', 'DOCUMENT', 'SYSTEME');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('VIREMENT', 'PRELEVEMENT', 'CHEQUE', 'CB', 'ESPECES', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."platform_type" AS ENUM('UBER_EATS', 'DELIVEROO', 'JUST_EAT', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."pole" AS ENUM('DIRECTION', 'COMPTABILITE', 'RH', 'ANIMATION', 'COMMUNICATION', 'DEVELOPPEMENT');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('EMAIL', 'TELEPHONE', 'COURRIER', 'LRAR', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."revenue_channel" AS ENUM('SUR_PLACE', 'EMPORTE', 'TABLETTE', 'UBER_EATS', 'DELIVEROO', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."revenue_source" AS ENUM('SAISIE', 'IMPORT_CSV');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'DIRECTION', 'COMPTABILITE', 'RH', 'ANIMATION', 'COMMUNICATION', 'DEVELOPPEMENT', 'FRANCHISE');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('EN_PROJET', 'OUVERTE', 'FERMEE_TEMPORAIREMENT', 'FERMEE');--> statement-breakpoint
CREATE TYPE "public"."store_type" AS ENUM('FRANCHISE', 'SUCCURSALE');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('NOUVEAU', 'AFFECTE', 'EN_COURS', 'EN_ATTENTE', 'TERMINE', 'VALIDE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" "audit_action" NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"changes" jsonb,
	"snapshot" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"franchisee_id" uuid,
	"type" "contract_type" NOT NULL,
	"status" "contract_status" DEFAULT 'BROUILLON' NOT NULL,
	"reference" text,
	"signed_at" date,
	"start_date" date,
	"end_date" date,
	"alert_months_before" integer DEFAULT 6 NOT NULL,
	"expiry_alert_sent_at" timestamp with time zone,
	"parent_contract_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"change_note" text,
	"effective_date" date,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" "document_category" NOT NULL,
	"notes" text,
	"visible_to_roles" "role"[] DEFAULT '{}' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_decision" boolean DEFAULT false NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "exchange_type" NOT NULL,
	"status" "exchange_status" DEFAULT 'OUVERT' NOT NULL,
	"subject" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_path" text NOT NULL,
	"entity_type" "attachment_entity",
	"entity_id" uuid,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchisees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"legal_form" text,
	"siren" text,
	"contact_first_name" text NOT NULL,
	"contact_last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"postal_code" text,
	"city" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchisees_siren_unique" UNIQUE("siren")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "invoice_type" NOT NULL,
	"label" text,
	"period_start" date,
	"period_end" date,
	"amount_ht" numeric(12, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"amount_ttc" numeric(12, 2) NOT NULL,
	"issued_at" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'EMISE' NOT NULL,
	"overdue_notified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_at" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"channel" "reminder_channel" NOT NULL,
	"sent_at" date NOT NULL,
	"sent_by_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"date" date NOT NULL,
	"channel" "revenue_channel" NOT NULL,
	"channel_label" text,
	"gross_amount" numeric(12, 2) NOT NULL,
	"net_amount" numeric(12, 2),
	"source" "revenue_source" DEFAULT 'SAISIE' NOT NULL,
	"entered_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "store_platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"platform" "platform_type" NOT NULL,
	"label" text,
	"account_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"activated_at" date
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "store_type" NOT NULL,
	"status" "store_status" DEFAULT 'EN_PROJET' NOT NULL,
	"franchisee_id" uuid,
	"animateur_id" uuid,
	"address" text,
	"postal_code" text,
	"city" text,
	"region" text,
	"phone" text,
	"email" text,
	"siret" text,
	"opening_date" date,
	"closing_date" date,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "tickets_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text NOT NULL,
	"store_id" uuid,
	"requester_id" uuid NOT NULL,
	"from_pole" "pole" NOT NULL,
	"to_pole" "pole" NOT NULL,
	"assignee_id" uuid,
	"priority" "ticket_priority" DEFAULT 'NORMALE' NOT NULL,
	"status" "ticket_status" DEFAULT 'NOUVEAU' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"validated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" "role" NOT NULL,
	"pole" "pole",
	"franchisee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_franchisee_id_franchisees_id_fk" FOREIGN KEY ("franchisee_id") REFERENCES "public"."franchisees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_contract_id_contracts_id_fk" FOREIGN KEY ("parent_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_id_file_attachments_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_document_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_messages" ADD CONSTRAINT "exchange_messages_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_messages" ADD CONSTRAINT "exchange_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_entries" ADD CONSTRAINT "revenue_entries_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_platforms" ADD CONSTRAINT "store_platforms_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_franchisee_id_franchisees_id_fk" FOREIGN KEY ("franchisee_id") REFERENCES "public"."franchisees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_animateur_id_users_id_fk" FOREIGN KEY ("animateur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_franchisee_id_franchisees_id_fk" FOREIGN KEY ("franchisee_id") REFERENCES "public"."franchisees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_record_idx" ON "audit_logs" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contracts_store_idx" ON "contracts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "contracts_end_date_status_idx" ON "contracts" USING btree ("end_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_doc_version_unique" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_file_unique" ON "document_versions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category","is_archived");--> statement-breakpoint
CREATE INDEX "exchange_messages_exchange_idx" ON "exchange_messages" USING btree ("exchange_id","created_at");--> statement-breakpoint
CREATE INDEX "exchanges_store_status_idx" ON "exchanges" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "exchanges_type_status_idx" ON "exchanges" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "file_attachments_storage_path_unique" ON "file_attachments" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "file_attachments_entity_idx" ON "file_attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_store_status_idx" ON "invoices" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "invoices_due_date_status_idx" ON "invoices" USING btree ("due_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_unique" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "reminders_invoice_idx" ON "reminders" USING btree ("invoice_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_entries_store_date_channel_unique" ON "revenue_entries" USING btree ("store_id","date","channel");--> statement-breakpoint
CREATE INDEX "revenue_entries_store_date_idx" ON "revenue_entries" USING btree ("store_id","date");--> statement-breakpoint
CREATE INDEX "revenue_entries_date_idx" ON "revenue_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_platforms_store_platform_unique" ON "store_platforms" USING btree ("store_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_code_unique" ON "stores" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stores_type_status_idx" ON "stores" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "stores_animateur_idx" ON "stores" USING btree ("animateur_id");--> statement-breakpoint
CREATE INDEX "stores_franchisee_idx" ON "stores" USING btree ("franchisee_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_idx" ON "ticket_comments" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_unique" ON "tickets" USING btree ("number");--> statement-breakpoint
CREATE INDEX "tickets_to_pole_status_idx" ON "tickets" USING btree ("to_pole","status");--> statement-breakpoint
CREATE INDEX "tickets_assignee_status_idx" ON "tickets" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "tickets_store_idx" ON "tickets" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");