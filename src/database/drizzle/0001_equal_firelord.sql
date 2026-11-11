CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"loginAt" timestamp with time zone NOT NULL,
	"expiredAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Config" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ScanLog" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Ticket" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Ticket" ADD PRIMARY KEY ("nama");--> statement-breakpoint
ALTER TABLE "Config" ADD COLUMN "value" text NOT NULL;--> statement-breakpoint
ALTER TABLE "Config" DROP COLUMN "status";