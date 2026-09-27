CREATE TABLE "detachment_links" (
	"name_key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
