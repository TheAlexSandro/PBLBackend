import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

export interface SheetTicket {
  id: string;
  nama: string;
  kelas: string;
}

@Injectable()
export class SheetsService {
  private readonly sheets: sheets_v4.Sheets;

  constructor(private readonly config: ConfigService) {
    const auth = new google.auth.JWT({
      email: config.getOrThrow<string>('GOOGLE_CLIENT_EMAIL'),
      key: config
        .getOrThrow<string>('GOOGLE_PRIVATE_KEY')
        .replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async fetchTickets(): Promise<SheetTicket[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.config.getOrThrow<string>('SHEET_ID'),
      range: this.config.getOrThrow<string>('SHEET_RANGE'),
    });

    return (res.data.values ?? [])
      .map((r) => ({
        id: String(r[0] ?? '').trim(),
        nama: String(r[1] ?? '').trim(),
        kelas: String(r[2] ?? '').trim(),
      }))
      .filter((t) => t.id.length > 0);
  }
}
