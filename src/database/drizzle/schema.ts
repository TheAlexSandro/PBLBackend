import { pgTable, text, timestamp, index, boolean, foreignKey, serial, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const scanResult = pgEnum("ScanResult", ['VALID', 'ALREADY_SCANNED', 'NOT_FOUND'])


export const config = pgTable("Config", {
	id: text().primaryKey().notNull(),
	value: text().notNull(),
});

export const session = pgTable("Session", {
	id: text().primaryKey().notNull(),
	loginAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	expiredAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	key: text(),
});

export const ticket = pgTable("Ticket", {
	id: text().primaryKey().notNull(),
	nama: text().notNull(),
	kelas: text().notNull(),
	scanned: boolean().default(false).notNull(),
	scannedAt: timestamp({ precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("Ticket_nama_idx").using("btree", table.nama.asc().nullsLast().op("text_ops")),
	index("Ticket_scanned_idx").using("btree", table.scanned.asc().nullsLast().op("bool_ops")),
]);

export const user = pgTable("User", {
	username: text().primaryKey().notNull(),
	password: text(),
});

export const scanLog = pgTable("ScanLog", {
	id: serial().primaryKey().notNull(),
	code: text().notNull(),
	ticketId: text(),
	result: scanResult().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("ScanLog_ticketId_idx").using("btree", table.ticketId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ticketId],
			foreignColumns: [ticket.id],
			name: "ScanLog_ticketId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);
