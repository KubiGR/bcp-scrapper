CREATE TABLE "bsdata_detachments" (
	"faction" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "bsdata_detachments_faction_name_pk" PRIMARY KEY("faction","name")
);
--> statement-breakpoint
CREATE TABLE "bsdata_files" (
	"path" text PRIMARY KEY NOT NULL,
	"sha" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "detachment_keeps" (
	"faction" text NOT NULL,
	"name_key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detachment_keeps_faction_name_key_pk" PRIMARY KEY("faction","name_key")
);
