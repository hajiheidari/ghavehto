import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getOwnerTrackingMetrics,panelId} from '../../../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'آمار پیوند کافه',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const digits=new Intl.NumberFormat('fa-IR');
export default async function TrackingMetrics({params,searchParams}:{params:Promise<{cafeId:string}>;searchParams:Promise<{link?:string|string[]}>}) {
  if(process.env.PRIVATE_TRACKING_OWNER_VIEW!=='1') notFound();
  const {cafeId}=await params,{link}=await searchParams;
  if(!panelId(cafeId)||!panelId(link)) notFound();
  const result=await getOwnerTrackingMetrics(cafeId.toLowerCase(),link.toLowerCase());
  return <section className="section empty"><Link href={'/dashboard/cafe/'+cafeId+'/tracking'}>بازگشت به پیوندها</Link>
    <h1>آمار پیوند کافه</h1>
    {result.state==='signed-out'?<p>برای مشاهدهٔ آمار به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">آمار در دسترس نیست یا مجوز مالک ندارید.</p>:
      <><dl>
        <dt>اسکن ثبت‌شده</dt><dd>{digits.format(BigInt(result.data.qrScans))}</dd>
        <dt>کلیک دریافت برنامه</dt><dd>{digits.format(BigInt(result.data.storeClicks))}</dd>
        <dt>ثبت‌نام تازهٔ منتسب</dt><dd>{digits.format(BigInt(result.data.registrations))}</dd>
        <dt>تأیید شمارهٔ منتسب</dt><dd>{digits.format(BigInt(result.data.phoneVerifications))}</dd>
        <dt>تعامل تأییدشده</dt><dd>{digits.format(BigInt(result.data.confirmedInteractions))}</dd>
      </dl><p>اسکن و کلیک، نصب برنامه یا حضور در کافه را اثبات نمی‌کنند.</p></>}
  </section>;
}
