import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';

export class ApiErrorDto {
  @ApiProperty({ enum: ['invalid_request','unauthorized','forbidden','not_found','unavailable','internal_error'] }) code!: string;
  @ApiProperty({ type: String }) message!: string;
  @ApiProperty({ type: String, format: 'uuid' }) requestId!: string;
}

@Catch()
export class SafeHttpErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const parser = error as {type?:unknown;status?:unknown} | null;
    const parserStatus = parser && ['entity.parse.failed','entity.too.large'].includes(String(parser.type)) && [400,413].includes(Number(parser.status)) ? Number(parser.status) : 500;
    const status = error instanceof HttpException ? error.getStatus() : parserStatus;
    const requestId = http.getRequest().ghRequestId ?? randomUUID();
    response.setHeader('X-Request-ID',requestId);
    const codes: Record<number, [string,string]> = {
      400: ['invalid_request','درخواست معتبر نیست.'],
      401: ['unauthorized','ورود معتبر لازم است.'],
      403: ['forbidden','دسترسی مجاز نیست.'],
      404: ['not_found','موردی پیدا نشد.'],
      503: ['unavailable','سرویس فعلاً در دسترس نیست.'],
    };
    const [code,message] = codes[status] ?? (status >= 500 ? ['internal_error','خطایی رخ داد.'] : ['invalid_request','درخواست معتبر نیست.']);
    // Never return exception text, SQL details, submitted credentials or validation values.
    response.setHeader('Cache-Control','no-store');
    response.status(status).json({code,message,requestId});
  }
}
