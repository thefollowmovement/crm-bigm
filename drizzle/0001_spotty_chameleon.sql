CREATE TABLE "product_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"date" date NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount" numeric(12, 2),
	"source" "revenue_source" DEFAULT 'SAISIE' NOT NULL,
	"entered_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"family_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "revenue_entries" ADD COLUMN "order_count" integer;--> statement-breakpoint
ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_families_name_unique" ON "product_families" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sales_store_date_product_unique" ON "product_sales" USING btree ("store_id","date","product_id");--> statement-breakpoint
CREATE INDEX "product_sales_store_date_idx" ON "product_sales" USING btree ("store_id","date");--> statement-breakpoint
CREATE INDEX "product_sales_product_date_idx" ON "product_sales" USING btree ("product_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_unique" ON "products" USING btree ("code");--> statement-breakpoint
CREATE INDEX "products_family_idx" ON "products" USING btree ("family_id");