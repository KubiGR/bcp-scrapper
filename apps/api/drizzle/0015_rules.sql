CREATE TABLE "rules_snapshot" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"bundle" text NOT NULL,
	"data_version" integer,
	"read_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "rules_snapshot_single_row" CHECK ("rules_snapshot"."id" = 1)
);
