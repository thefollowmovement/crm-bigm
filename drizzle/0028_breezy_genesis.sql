CREATE TABLE "transmission_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"external_name" text,
	"category" "external_category" DEFAULT 'AUTRE' NOT NULL,
	"structure_id" uuid,
	"note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_attachments" ALTER COLUMN "uploaded_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transmissions" ADD COLUMN "invite_id" uuid;--> statement-breakpoint
ALTER TABLE "transmission_invites" ADD CONSTRAINT "transmission_invites_structure_id_acct_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."acct_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmission_invites" ADD CONSTRAINT "transmission_invites_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transmission_invites_token_hash_unique" ON "transmission_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "transmission_invites_created_idx" ON "transmission_invites" USING btree ("created_at");