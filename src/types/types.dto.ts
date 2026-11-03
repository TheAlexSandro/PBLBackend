export type Callback<T> = (error: string | null, result: T | null) => void;

export interface SheetTicket {
  id: string;
  nama: string;
  kelas: string;
}

export type TicketRow = SheetTicket;

export type Resolution =
  | { kind: 'found'; ticket: TicketRow }
  | { kind: 'ambiguous'; candidates: TicketRow[] }
  | { kind: 'none' };

export interface SyncResult {
  total: number;
  created: number;
}

export const errText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export function toCallback<T>(source: PromiseLike<T>, cb: Callback<T>): void {
  source.then(
    (result) => cb(null, result),
    (e: unknown) => cb(errText(e), null),
  );
}
