CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "phone_format" CHECK ("customers"."phone" ~ '^601[0-9]{8,9}$')
);

CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"schedule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"request_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"schedule_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"tag" text NOT NULL,
	"cart" jsonb NOT NULL,
	"bottles" integer NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"receipt_id" uuid,
	"packed" boolean DEFAULT false NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_token_unique" UNIQUE("token"),
	CONSTRAINT "orders_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "order_total_positive" CHECK ("orders"."total" > 0),
	CONSTRAINT "order_bottles_positive" CHECK ("orders"."bottles" > 0),
	CONSTRAINT "order_status" CHECK ("orders"."status" in ('pending_payment','pending_review','confirmed','ready','collected','rejected'))
);

CREATE TABLE "schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"capacity" integer DEFAULT 30 NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"photo_id" uuid,
	"dropped_at" timestamp with time zone,
	CONSTRAINT "positive_capacity" CHECK ("schedules"."capacity" > 0)
);

ALTER TABLE "media" ADD CONSTRAINT "media_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "media" ADD CONSTRAINT "media_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "schedule_sequence" ON "orders" USING btree ("schedule_id","sequence");