import {randomUUID} from 'node:crypto';
import {BadRequestException,Body,Controller,Get,Header,Headers,Inject,Ip,Param,Post,Res} from '@nestjs/common';
import {IsIn,IsUUID} from 'class-validator';
import {CafeTrackingService} from './cafe-tracking.js';

class TrackingConsentDto {
  @IsIn(['yes','no']) consent!: 'yes'|'no';
  @IsIn(['qr_scan','store_click']) kind!: 'qr_scan'|'store_click';
  @IsUUID('4') operationId!:string;
}
const page=(content:string)=>`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>پیوند کافه | قهوه‌تو</title></head><body><main><h1>پیوند کافه</h1>${content}</main></body></html>`;

/** Not registered by default. GET never writes, cookies and external redirects are absent. */
@Controller('q')
export class CafeTrackingController {
  constructor(@Inject(CafeTrackingService) private readonly tracking:CafeTrackingService) {}
  private code(code:string):string {
    if(!/^[0-9a-f]{64}$/.test(code)) throw new BadRequestException();
    return code;
  }
  @Get(':code') @Header('Cache-Control','no-store') @Header('Referrer-Policy','no-referrer') @Header('Content-Type','text/html; charset=utf-8')
  landing(@Param('code') input:string):string {
    const code=this.code(input);
    return page(`<p>ثبت رهگیری اختیاری است. در صورت رضایت، اسکن این پیوند برای انتساب ثبت‌نام تازه ثبت می‌شود. یک شناسهٔ رمزنگاری‌شده از نشانی شبکه برای محدودیت نرخ نگهداری می‌شود؛ شماره تلفن و نشانی خام شبکه در رهگیری ذخیره نمی‌شوند.</p><p>اسکن یا کلیک به‌معنای نصب، بازدید واقعی، دریافت پاداش یا عضویت کافه نیست. ورود و دریافت برنامه فعلاً فعال نیست.</p><form method="post" action="/q/${code}"><input type="hidden" name="operationId" value="${randomUUID()}"><input type="hidden" name="kind" value="qr_scan"><button type="submit" name="consent" value="yes">با ثبت اسکن موافقم</button><button type="submit" name="consent" value="no">بدون رهگیری ادامه می‌دهم</button></form>`);
  }
  @Post(':code') @Header('Cache-Control','no-store') @Header('Referrer-Policy','no-referrer')
  async consent(@Param('code') input:string,@Body() body:TrackingConsentDto,@Ip() ip:string,@Headers('origin') origin:string|undefined,@Headers('content-type') contentType:string|undefined,@Res({passthrough:true}) response:{setHeader(name:string,value:string):void}) {
    if(origin!==this.tracking.publicOrigin) throw new BadRequestException();
    const code=this.code(input);
    const touchId=body.consent==='yes'?await this.tracking.record(code,body.kind,body.operationId,ip):null;
    if(contentType?.split(';')[0]==='application/x-www-form-urlencoded') {
      response.setHeader('Content-Type','text/html; charset=utf-8');
      return page(touchId?'<p>رهگیری انتخاب‌شده ثبت شد. این ثبت به‌معنای نصب، بازدید واقعی یا دریافت پاداش نیست. ورود و دریافت برنامه فعلاً فعال نیست.</p>':'<p>بدون ثبت رهگیری ادامه دادید. ورود و دریافت برنامه فعلاً فعال نیست.</p>');
    }
    return {tracked:touchId!==null,touchId};
  }
}
