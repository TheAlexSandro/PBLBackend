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
}
