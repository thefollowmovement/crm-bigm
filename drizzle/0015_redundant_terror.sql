ALTER TYPE "public"."audit_action" ADD VALUE 'IMPERSONATE';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonator_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_user_id_users_id_fk" FOREIGN KEY ("impersonator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;