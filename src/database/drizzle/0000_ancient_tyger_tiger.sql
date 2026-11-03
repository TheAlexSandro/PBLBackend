-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."ScanResult" AS ENUM('VALID', 'ALREADY_SCANNED', 'NOT_FOUND');--> statement-breakpoint
CREATE TABLE "Config" (
	"id" text PRIMARY KEY NOT NULL,
	"status" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "Ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kelas" text NOT NULL,
	"scanned" boolean DEFAULT false NOT NULL,
	"scannedAt" timestamp(3),
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ScanLog" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"ticketId" text,
	"result" "ScanResult" NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ScanLog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "Ticket_scanned_idx" ON "Ticket" USING btree ("scanned" bool_ops);--> statement-breakpoint
CREATE INDEX "ScanLog_ticketId_idx" ON "ScanLog" USING btree ("ticketId" text_ops);
*/