import { Injectable } from '@nestjs/common';
import { createPrivateKey } from 'crypto';
import { JWT } from 'google-auth-library';
import { Callback, SheetTicket, toCallback } from '../../types/types.dto';

const normalizeKey = (raw: string): string =>
  raw
    .trim()
    .replace(/^["']+|["',]+$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

@Injectable()
export class SheetsService {
  private readonly auth: JWT;
  private readonly url: string;

  constructor() {
    const key = normalizeKey(String(process.env['GOOGLE_PRIVATE_KEY']));
    try {
      createPrivateKey(key);
    } catch {
      throw new Error('Invalid key');
    }

    this.auth = new JWT({
      email: process.env['GOOGLE_CLIENT_EMAIL']!,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheetId = encodeURIComponent(process.env['SHEET_ID']!);
    const range = encodeURIComponent(process.env['SHEET_RANGE']!);
    this.url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  }

  fetchTickets(cb: Callback<SheetTicket[]>): void {
    toCallback(
      this.auth
        .request<{ values?: unknown[][] }>({ url: this.url })
        .then((res) =>
          (res.data.values ?? [])
            .map((r): SheetTicket => ({
              id: String(r[0] ?? '').trim(),
              nama: String(r[1] ?? '').trim(),
              kelas: String(r[2] ?? '').trim(),
            }))
            .filter((t) => t.id.length > 0),
        ),
      cb,
    );
  }
}
