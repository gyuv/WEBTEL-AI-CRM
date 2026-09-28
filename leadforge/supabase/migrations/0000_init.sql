CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"last4" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"provider" text NOT NULL,
	"day" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache" (
	"key" text PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"person_id" uuid,
	"phone" text,
	"outcome" text NOT NULL,
	"duration_s" integer DEFAULT 0,
	"notes" text,
	"ai_summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"progress_msg" text,
	"result" jsonb,
	"idempotency_key" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"person_id" uuid,
	"email" text NOT NULL,
	"kind" text DEFAULT 'found' NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"mx_ok" boolean,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_enrichment" (
	"lead_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text_sample" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"title" text,
	"seniority" text,
	"role_group" text,
	"dm_score" integer DEFAULT 0 NOT NULL,
	"profile_url" text,
	"location" text,
	"headline" text,
	"about" text,
	"activity" text,
	"source" text NOT NULL,
	"source_url" text,
	"guessed_email" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"icebreaker" text,
	"connection_note" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_phones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"person_id" uuid,
	"e164" text NOT NULL,
	"kind" text DEFAULT 'unknown' NOT NULL,
	"source" text,
	"dnd_checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_tags" (
	"tag_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"website" text,
	"address" text,
	"area" text,
	"city" text,
	"pincode" text,
	"lat" double precision,
	"lng" double precision,
	"category" text,
	"rating" real,
	"reviews_count" integer,
	"maps_url" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"whatsapp" text,
	"gstin" text,
	"cin" text,
	"year_est" integer,
	"size_estimate" text,
	"status" text DEFAULT 'new' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"fit_score" integer DEFAULT 0 NOT NULL,
	"intent_score" integer DEFAULT 0 NOT NULL,
	"reach_score" integer DEFAULT 0 NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"deal_value" integer DEFAULT 0,
	"enrich_status" text DEFAULT 'pending' NOT NULL,
	"dnd_checked" boolean DEFAULT false NOT NULL,
	"do_not_call" boolean DEFAULT false NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"last_enriched_at" timestamp with time zone,
	"primary_source" text,
	"search_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_leads" (
	"list_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid,
	"direction" text DEFAULT 'in' NOT NULL,
	"from_address" text,
	"subject" text,
	"body" text NOT NULL,
	"thread_id" text,
	"provider_message_id" text,
	"classification" text,
	"confidence" integer,
	"summary" text,
	"source" text DEFAULT 'paste' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"lead_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"person_id" uuid,
	"product_id" uuid,
	"template_id" uuid,
	"channel" text NOT NULL,
	"to_address" text,
	"subject" text,
	"body" text,
	"variant" text,
	"thread_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"short_desc" text,
	"long_desc" text,
	"target_industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icp" text,
	"problems_solved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing" text,
	"usps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"case_studies" text,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brochure_url" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"company_name" text,
	"services" text,
	"tone" text DEFAULT 'friendly-professional',
	"languages" jsonb DEFAULT '["English","Tamil"]'::jsonb,
	"signature" text,
	"meeting_link" text,
	"phone" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"raw_input" text NOT NULL,
	"input_type" text NOT NULL,
	"intent" jsonb,
	"filters" jsonb,
	"result_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text,
	"source_url" text,
	"snippet" text,
	"method" text DEFAULT 'found' NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"provider" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"actor" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"name" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"lead_id" uuid,
	"kind" text DEFAULT 'follow_up' NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text DEFAULT 'owner' NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_emails" ADD CONSTRAINT "lead_emails_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_enrichment" ADD CONSTRAINT "lead_enrichment_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_insights" ADD CONSTRAINT "lead_insights_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_people" ADD CONSTRAINT "lead_people_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_leads" ADD CONSTRAINT "list_leads_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_leads" ADD CONSTRAINT "list_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_log" ADD CONSTRAINT "outreach_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_user_provider" ON "api_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_unique" ON "api_usage" USING btree ("user_id","provider","day");--> statement-breakpoint
CREATE INDEX "audit_user_created" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "call_logs_lead" ON "call_logs" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "call_logs_user_time" ON "call_logs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idem" ON "jobs" USING btree ("user_id","idempotency_key") WHERE "jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "jobs_status_run" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_emails_lead_email" ON "lead_emails" USING btree ("lead_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_insights_lead_kind" ON "lead_insights" USING btree ("lead_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_people_lead_name" ON "lead_people" USING btree ("lead_id","normalized_name");--> statement-breakpoint
CREATE INDEX "lead_people_lead" ON "lead_people" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_phones_lead_e164" ON "lead_phones" USING btree ("lead_id","e164");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_tags_pk" ON "lead_tags" USING btree ("tag_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_user_domain" ON "leads" USING btree ("user_id","domain") WHERE "leads"."domain" is not null;--> statement-breakpoint
CREATE INDEX "leads_user_status" ON "leads" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "leads_user_score" ON "leads" USING btree ("user_id","score");--> statement-breakpoint
CREATE INDEX "leads_user_norm" ON "leads" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "list_leads_pk" ON "list_leads" USING btree ("list_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_user_name" ON "lists" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_id" ON "messages" USING btree ("user_id","provider_message_id") WHERE "messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_lead" ON "messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "outreach_lead" ON "outreach_log" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "outreach_thread" ON "outreach_log" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_user_name" ON "products" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "searches_user_created" ON "searches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "source_records_entity" ON "source_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "status_history_lead" ON "status_history" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_unique" ON "suppression_list" USING btree ("user_id","kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "tasks_user_due" ON "tasks" USING btree ("user_id","due_at");