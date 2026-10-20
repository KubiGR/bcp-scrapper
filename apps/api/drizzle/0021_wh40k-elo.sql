CREATE TABLE "wh40k_elo" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"elo" real NOT NULL,
	"peak" real,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"draws" integer NOT NULL,
	"last_active" timestamp with time zone,
	"imported_at" timestamp with time zone NOT NULL
);
