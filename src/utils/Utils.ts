import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';

export class Utils {
  static response(
    res: Response,
    status_code: HttpStatus,
    ok: boolean,
    message: string | Error | null = null,
    error_code: string | null = null,
    result: any = null,
  ): void {
    const responseData = this.cleanJSON({
      status_code,
      ok,
      error_code,
      message: message instanceof Error ? message.message : message,

      result,
    });

    res.status(status_code).json(responseData);
  }

  static cleanJSON<T extends Record<string, any>>(data: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(data).filter(
        ([_, value]) => value !== undefined && value !== null,
      ),
    ) as Partial<T>;
  }

  static generateID = (length: number) => {
    const characters =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const panjangKarakter = characters.length;
    let result = '';

    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * panjangKarakter));
    }

    return result;
  };

  static getCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      if (part.slice(0, idx).trim() === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return undefined;
  }

  static getThisYear(): string {
    return String(new Date().getFullYear());
  }

  static isFinalYear(value: unknown, year: number | string): boolean {
    return String(value ?? '')
      .split(',')
      .some((t) => t.trim() === String(year));
  }
}
