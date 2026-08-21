CREATE TABLE "depots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dps_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"depot_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reference" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"source" "revenue_source" DEFAULT 'SAISIE' NOT NULL,
	"entered_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "depot_id" uuid;--> statement-breakpoint
ALTER TABLE "dps_purchases" ADD CONSTRAINT "dps_purchases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_purchases" ADD CONSTRAINT "dps_purchases_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dps_purchases" ADD CONSTRAINT "dps_purchases_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "depots_code_unique" ON "depots" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "dps_purchases_store_date_ref_unique" ON "dps_purchases" USING btree ("store_id","date","reference");--> statement-breakpoint
CREATE INDEX "dps_purchases_store_date_idx" ON "dps_purchases" USING btree ("store_id","date");--> statement-breakpoint
CREATE INDEX "dps_purchases_depot_date_idx" ON "dps_purchases" USING btree ("depot_id","date");--> statement-breakpoint
CREATE INDEX "dps_purchases_date_idx" ON "dps_purchases" USING btree ("date");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;