CREATE TABLE "recurring_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_id" uuid NOT NULL,
	"month" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_payments_month_unique" UNIQUE("recurring_id","month")
);
--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_recurring_id_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring"("id") ON DELETE cascade ON UPDATE no action;