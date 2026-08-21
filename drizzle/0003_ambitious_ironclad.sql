CREATE TYPE "public"."plan_activity" AS ENUM('VISITE', 'AUDIT', 'FORMATION', 'OUVERTURE', 'REUNION', 'TRAJET', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."plan_period" AS ENUM('MATIN', 'APRES_MIDI', 'JOURNEE');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PLANNING';--> statement-breakpoint
CREATE TABLE "animator_plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animateur_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period" "plan_period" NOT NULL,
	"activity" "plan_activity" NOT NULL,
	"store_id" uuid,
	"label" text,
	"km_estimated" numeric(6, 1),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"zone" text,
	"theoretical_route" text,
	"cost_per_km" numeric(6, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animator_plan_entries" ADD CONSTRAINT "animator_plan_entries_animateur_id_users_id_fk" FOREIGN KEY ("animateur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animator_plan_entries" ADD CONSTRAINT "animator_plan_entries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animator_profiles" ADD CONSTRAINT "animator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animator_plan_entries_slot_unique" ON "animator_plan_entries" USING btree ("animateur_id","date","period");--> statement-breakpoint
CREATE INDEX "animator_plan_entries_animateur_date_idx" ON "animator_plan_entries" USING btree ("animateur_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "animator_profiles_user_unique" ON "animator_profiles" USING btree ("user_id");