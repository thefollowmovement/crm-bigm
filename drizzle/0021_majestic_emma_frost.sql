CREATE TABLE "custom_role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_role" "role" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "custom_role_permissions" ADD CONSTRAINT "custom_role_permissions_custom_role_id_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_role_permissions_role_permission_unique" ON "custom_role_permissions" USING btree ("custom_role_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_roles_name_unique" ON "custom_roles" USING btree ("name");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_custom_role_id_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id") ON DELETE no action ON UPDATE no action;