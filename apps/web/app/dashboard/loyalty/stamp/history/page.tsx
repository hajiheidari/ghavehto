import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getLoyaltyHistory,panelId} from '../../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'سوابق مهر این برنامه',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const kinds:Record<string,string>={award:'دریافت',spend:'مصرف',expire:'انقضا',reversal:'برگشت ثبت'};
export default async function History({searchParams}:{searchParams:Promise<{cafeId?:string|string[];programId?:string|string[];version?:string|string[];after?:string|string[]}>}) {
  if(process.env.PRIVATE_LOYALTY_HISTORY_VIEW!=='1') notFound();
  const {cafeId,programId,version,after}=await searchParams;
  if(!panelId(cafeId)||!panelId(programId)||typeof version!=='string'||!/^[1-9][0-9]{0,9}$/.test(version)||Number(version)>2147483647||
    (after!==undefined&&!panelId(after))) notFound();
  const result=await getLoyaltyHistory('stamp',after as string|undefined,{cafeId,programId,version:Number(version)});
  const numbers=new Intl.NumberFormat('fa-IR');
  const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
  return <section className="section empty"><h1>سوابق مهر این برنامه</h1>
    <p>شناسهٔ کافه: <bdi>{cafeId}</bdi> · نسخهٔ برنامه: {numbers.format(Number(version))}</p>
    {result.state==='signed-out'?<p>برای مشاهدهٔ سوابق به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">سوابق این برنامه قابل‌نمایش نیستند. دسترسی و شناسه‌ها را بررسی کنید و دوباره تلاش کنید.</p>:
      result.data.items.length===0?<p>سابقهٔ قدیمی‌تری در این صفحه نیست.</p>:<ol>{result.data.items.map(entry=><li key={entry.id}>
        <p>{kinds[entry.kind]}: <bdi>{numbers.format(entry.units)}</bdi></p>
        <p>زمان ثبت: <time dateTime={entry.recordedAt}>{dates.format(new Date(entry.recordedAt))}</time></p>
        {entry.expiresAt&&<p>زمان انقضا: <time dateTime={entry.expiresAt}>{dates.format(new Date(entry.expiresAt))}</time></p>}
        {entry.reversalOf&&<p>ارجاع برگشت: <bdi>{entry.reversalOf}</bdi></p>}
      </li>)}</ol>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{pathname:'/dashboard/loyalty/stamp/history',
      query:{cafeId,programId,version,after:result.data.nextCursor}}}>سوابق قدیمی‌تر این برنامه</Link>}
    <p><Link href={{pathname:'/dashboard/loyalty/stamp',query:{cafeId,programId,version}}}>ماندهٔ همین دفتر مهر</Link></p>
  </section>;
}
