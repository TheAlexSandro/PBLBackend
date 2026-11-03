import { relations } from "drizzle-orm/relations";
import { ticket, scanLog } from "./schema";

export const scanLogRelations = relations(scanLog, ({one}) => ({
	ticket: one(ticket, {
		fields: [scanLog.ticketId],
		references: [ticket.id]
	}),
}));

export const ticketRelations = relations(ticket, ({many}) => ({
	scanLogs: many(scanLog),
}));