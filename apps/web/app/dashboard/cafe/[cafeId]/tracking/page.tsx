import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getOwnerTrackingLinks,panelId,staffPanelOrigin} from '../../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'پیوندهای رهگیری کافه',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeZone:'Asia/Tehran'});
export default async function TrackingPage({params,searchParams}:{params:Promise<{cafeId:string}>;searchParams:Promise<{after?:string|string[];stop?:string|string[]}>}) {
  if(process.env.PRIVATE_TRACKING_OWNER_VIEW!=='1') notFound();
  const {cafeId}=await params;
  const {after,stop}=await searchParams;
  if(!panelId(cafeId)||(after!==undefined&&!panelId(after))) notFound();
  const result=await getOwnerTrackingLinks(cafeId,after);
  return <section className="section empty">
    <Link href={'/dashboard/cafe/'+cafeId}>بازگشت به کافه</Link>
    <h1>پیوندهای رهگیری کافه</h1>
    {result.state==='signed-out'?<p>برای مشاهدهٔ پیوندها به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">پیوندها در دسترس نیستند یا مجوز مالک ندارید.</p>:
      <>
        {stop==='saved'&&<p role="status">توقف پیوند ثبت شد.</p>}
        {stop==='unconfirmed'&&<p role="status">توقف پیوند تأیید نشد. وضعیت پیوند را بررسی کنید.</p>}
        {result.data.items.length===0?<p>پیوندی ثبت نشده است.</p>:result.data.items.map(item=><article key={item.linkId}>
          <h2>پیوند <bdi dir="ltr">{item.linkId}</bdi></h2>
          <dl><dt>شعبه</dt><dd><bdi dir="ltr">{item.branchId}</bdi></dd>
            <dt>وضعیت</dt><dd>{item.active?'فعال':'متوقف یا غیرفعال'}</dd>
            <dt>انقضا</dt><dd>{dates.format(new Date(item.expiresAt))}</dd></dl>
          {item.active&&staffPanelOrigin()&&<form method="post" action={'/dashboard/cafe/'+cafeId+'/tracking/stop'}>
            <input type="hidden" name="linkId" value={item.linkId}/>
            <label htmlFor={'reason-'+item.linkId}>دلیل توقف</label>{' '}
            <input id={'reason-'+item.linkId} name="reason" required maxLength={240}/>{' '}
            <button type="submit">توقف پیوند</button>
          </form>}
        </article>)}
        {result.data.nextCursor&&<Link href={{pathname:'/dashboard/cafe/'+cafeId+'/tracking',query:{after:result.data.nextCursor}}}>صفحهٔ بعد</Link>}
      </>}
  </section>;
}
