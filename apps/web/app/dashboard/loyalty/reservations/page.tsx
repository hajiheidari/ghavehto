import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getRewardReceipts,panelId,recoverRewardReceipt,type RewardLedger} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'رسیدهای رزرو پاداش',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Reservations({searchParams}:{searchParams:Promise<{ledger?:string|string[];after?:string|string[];operation?:string|string[]}>}) {
  if(process.env.PRIVATE_LOYALTY_HISTORY_VIEW!=='1') notFound();
  const {ledger='star',after,operation}=await searchParams;
  if((ledger!=='stamp'&&ledger!=='star')||(after!==undefined&&!panelId(after))||
    (operation!==undefined&&!panelId(operation))||(operation!==undefined&&after!==undefined)) notFound();
  const kind=ledger as RewardLedger;
  const response=operation?await recoverRewardReceipt(kind,operation):await getRewardReceipts(kind,after as string|undefined);
  const result=response.state==='ready'?{state:'ready' as const,data:'items' in response.data?response.data:{items:[response.data],nextCursor:null}}:response;
  const numbers=new Intl.NumberFormat('fa-IR');
  const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
  return <section className="section empty"><h1>رسیدهای رزرو پاداش</h1>
    <nav aria-label="نوع پاداش"><Link href="/dashboard/loyalty/reservations?ledger=stamp">پاداش مهر کافه</Link>{' '}
      <Link href="/dashboard/loyalty/reservations?ledger=star">پاداش ستاره</Link></nav>
    <p>این رسید، ثبت رزرو را نشان می‌دهد. تحویل پاداش یا پرداخت واقعی در این صفحه تأیید نمی‌شود.</p>
    <p>اعتبار منقضی‌شده با لغو رزرو تمدید یا دوباره قابل‌خرج نمی‌شود.</p>
    <form method="get" action="/dashboard/loyalty/reservations"><input type="hidden" name="ledger" value={kind}/>
      <label htmlFor="operation">شناسهٔ عملیات برای بازیابی رسید</label>{' '}
      <input id="operation" name="operation" dir="ltr" maxLength={36} defaultValue={operation} required/>{' '}
      <button type="submit">بازیابی رسید</button>
    </form>
    {result.state==='signed-out'?<p>برای مشاهدهٔ رسیدها به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">رسیدها قابل‌نمایش نیستند. شناسه و دسترسی را بررسی کنید و دوباره تلاش کنید.</p>:
      result.data.items.length===0?<p>در این صفحه رسید رزروی ثبت نشده است.</p>:<ul>{result.data.items.map(receipt=><li key={receipt.id}>
        <p>شناسهٔ رسید: <bdi>{receipt.id}</bdi></p>
        <p>{receipt.state==='cancelled'?'رزرو لغوشده':'رزرو ثبت‌شده'} · مقدار ثبت‌شده: <bdi>{numbers.format(receipt.reservedUnits)}</bdi></p>
        <p>زمان ثبت: <time dateTime={receipt.recordedAt}>{dates.format(new Date(receipt.recordedAt))}</time></p>
        {kind==='stamp'&&<Link href={{pathname:'/dashboard/loyalty/stamp',query:{cafeId:receipt.cafeId,programId:receipt.programId,version:receipt.programVersion}}}>دفتر مهر این برنامه</Link>}
        {receipt.cancelledAt&&<p>زمان لغو: <time dateTime={receipt.cancelledAt}>{dates.format(new Date(receipt.cancelledAt))}</time></p>}
      </li>)}</ul>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{pathname:'/dashboard/loyalty/reservations',query:{ledger:kind,after:result.data.nextCursor}}}>رسیدهای قدیمی‌تر</Link>}
    <p><Link href={{pathname:'/dashboard/loyalty',query:{ledger:kind}}}>تاریخچهٔ دفتر</Link></p>
  </section>;
}
