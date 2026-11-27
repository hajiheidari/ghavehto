import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getLoyaltyHistory,panelId,type LoyaltyLedger} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'تاریخچهٔ وفاداری',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const names={stamp:'مهرهای کافه',star:'ستاره‌های قابل‌خرج',tier:'امتیاز عضویت'};
const kinds:Record<string,string>={award:'دریافت',spend:'مصرف',expire:'انقضا',reversal:'برگشت ثبت'};
const numbers=new Intl.NumberFormat('fa-IR');
const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
export default async function Loyalty({searchParams}:{searchParams:Promise<{ledger?:string|string[];after?:string|string[]}>}) {
  if(process.env.PRIVATE_LOYALTY_HISTORY_VIEW!=='1') notFound();
  const query=await searchParams;
  const ledger=query.ledger??'stamp';
  if(typeof ledger!=='string'||!(ledger in names)||!['stamp','star','tier'].includes(ledger)||
    (query.after!==undefined&&!panelId(query.after))) notFound();
  const kind=ledger as LoyaltyLedger;
  const result=await getLoyaltyHistory(kind,query.after as string|undefined);
  return <section className="section empty"><h1>تاریخچهٔ وفاداری</h1>
    <nav aria-label="دفترهای مستقل وفاداری"><ul>{Object.entries(names).map(([key,title])=>
      <li key={key}><Link href={{pathname:'/dashboard/loyalty',query:{ledger:key}}} aria-current={key===kind?'page':undefined}>{title}</Link></li>)}</ul></nav>
    <h2>{names[kind]}</h2>
    <p>هر دفتر تاریخچهٔ مستقل خود را دارد. این صفحه سوابق ثبت‌شده را نشان می‌دهد؛ ماندهٔ قابل‌مصرف نیاز به بررسی اعتبار و انقضای هر برنامه دارد.</p>
    {result.state==='signed-out'?<p>برای مشاهدهٔ تاریخچه به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">تاریخچه فعلاً در دسترس نیست. صفحه را دوباره باز کنید.</p>:
      result.data.items.length===0?<p>در این دفتر هنوز سابقه‌ای برای شما ثبت نشده است.</p>:
      <ol>{result.data.items.map(entry=><li key={entry.id}>
        <p>{kinds[entry.kind]}: <bdi>{numbers.format(entry.units)}</bdi></p>
        <p>زمان ثبت: <time dateTime={entry.recordedAt}>{dates.format(new Date(entry.recordedAt))}</time></p>
        {kind==='stamp'&&<p>شناسهٔ کافه: <bdi>{entry.cafeId}</bdi> · نسخهٔ برنامه: {numbers.format(entry.programVersion!)}</p>}
        {kind==='tier'&&<p>سال احراز میلادی: <bdi>{numbers.format(entry.qualificationYear!)}</bdi></p>}
        {entry.expiresAt&&<p>زمان انقضا: <time dateTime={entry.expiresAt}>{dates.format(new Date(entry.expiresAt))}</time></p>}
        {entry.reversalOf&&<p>ارجاع برگشت: <bdi>{entry.reversalOf}</bdi></p>}
      </li>)}</ol>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{pathname:'/dashboard/loyalty',query:{ledger:kind,after:result.data.nextCursor}}}>سوابق قدیمی‌تر</Link>}
  </section>;
}
