import {notFound} from 'next/navigation';
import {getParticipationReceipt,panelId} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'رسید مشارکت',robots:{index:false,follow:false},referrer:'no-referrer' as const};

const labels={reserved:'رزرو شده',cancelled:'لغو شده',fulfilled:'تحویل ثبت شده'};

export default async function ParticipationPage({searchParams}:{searchParams:Promise<{operation?:string|string[]}>}) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') notFound();
  const {operation}=await searchParams;
  const result=panelId(operation)?await getParticipationReceipt(operation):null;
  return <section className="section empty">
    <h1>رسید مشارکت</h1>
    <form method="get">
      <label htmlFor="operation">شناسهٔ درخواست رزرو</label>{' '}
      <input id="operation" name="operation" dir="ltr" required maxLength={36} defaultValue={panelId(operation)?operation:undefined}/>{' '}
      <button type="submit">مشاهدهٔ رسید</button>
    </form>
    {operation!==undefined&&!result&&<p role="status">شناسهٔ درخواست معتبر نیست.</p>}
    {result?.state==='signed-out'&&<p role="status">برای مشاهدهٔ رسید به نشست معتبر نیاز دارید.</p>}
    {result?.state==='unavailable'&&<p role="status">رسید مشارکت در دسترس نیست.</p>}
    {result?.state==='ready'&&<dl>
      <dt>وضعیت</dt><dd>{labels[result.data.state]}</dd>
      <dt>شناسهٔ رسید</dt><dd><bdi dir="ltr">{result.data.claimId}</bdi></dd>
    </dl>}
  </section>;
}
