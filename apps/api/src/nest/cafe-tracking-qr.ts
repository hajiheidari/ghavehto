import {createHash,randomBytes} from 'node:crypto';
import QRCode from 'qrcode';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const htmlText=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export interface CafeTrackingDraftOptions {
  cafeId:string;
  branchId:string;
  experienceId?:string;
  publicOrigin:string;
  lifetimeSeconds:number;
  attributionWindowSeconds:number;
}

/** Internal operator helper; stores only the random code hash and never activates the link. */
export async function prepareCafeTrackingQr(db:{query(sql:string,values:unknown[]):Promise<{rows:{id:string}[]}>},options:CafeTrackingDraftOptions) {
  const origin=new URL(options.publicOrigin);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash
    ||!uuid.test(options.cafeId)||!uuid.test(options.branchId)||(options.experienceId!==undefined&&!uuid.test(options.experienceId))
    ||![options.lifetimeSeconds,options.attributionWindowSeconds].every(n=>Number.isInteger(n)&&n>=1&&n<=31536000)) {
    throw new TypeError('Explicit HTTPS origin, scope and bounded lifetimes required');
  }
  const code=randomBytes(32).toString('hex');
  const url=new URL(`/q/${code}`,origin).toString();
  // Produce a complete artifact before recording the draft, so rendering failure cannot leave a link behind.
  const png=await QRCode.toBuffer(url,{type:'png',errorCorrectionLevel:'M',margin:4,width:960});
  const {rows:[row]}=await db.query(
    'SELECT public.register_cafe_tracking_draft($1,$2,$3,$4,$5,$6) AS id',
    [options.cafeId,options.branchId,options.experienceId??null,createHash('sha256').update(code,'ascii').digest(),
      options.lifetimeSeconds,options.attributionWindowSeconds]);
  const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پیش‌نویس کد کافه</title><style>body{font-family:Tahoma,sans-serif;max-width:44rem;margin:2rem auto;padding:1rem;text-align:center;color:#17221d;background:white}img{width:90%;max-width:32rem;height:auto}code{display:block;overflow-wrap:anywhere}@page{margin:18mm}</style></head><body><h1>پیش‌نویس کد کافه</h1><p>این پیوند هنوز فعال نشده است.</p><img alt="کد رهگیری کافه" width="960" height="960" src="data:image/png;base64,${png.toString('base64')}"><code dir="ltr">${htmlText(url)}</code><p>اسکن و کلیک به‌معنای نصب یا دریافت پاداش نیست.</p></body></html>`;
  return {id:row.id,url,png,html};
}
