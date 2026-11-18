import {randomUUID} from 'node:crypto';
import {notFound} from 'next/navigation';
import {getParticipationReceipt,panelId,participationVersion,staffPanelOrigin} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'رسید مشارکت',robots:{index:false,follow:false},referrer:'no-referrer' as const};

const labels={reserved:'رزرو شده',cancelled:'لغو شده',fulfilled:'تحویل ثبت شده'};

export default async function ParticipationPage({searchParams}:{searchParams:Promise<{operation?:string|string[];experience?:string|string[];branch?:string|string[];version?:string|string[];reservation?:string|string[]}>}) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') notFound();
  const {operation,experience,branch,version,reservation}=await searchParams;
  const result=panelId(operation)?await getParticipationReceipt(operation):null;
  return <section className="section empty">
    <h1>رسید مشارکت</h1>
    {staffPanelOrigin()&&panelId(experience)&&panelId(branch)&&participationVersion(version)!==null&&
      <form method="post" action="/dashboard/participation/reserve">
        <input type="hidden" name="experienceId" value={experience}/>
        <input type="hidden" name="branchId" value={branch}/>
        <input type="hidden" name="version" value={typeof version==='string'?version:undefined}/>
        <input type="hidden" name="operationId" value={randomUUID()}/>
        <button type="submit">رزرو این تجربه</button>
      </form>}
    {reservation==='unconfirmed'&&result?.state==='unavailable'&&<p role="status">رزرو تأیید نشد. برای بررسی دوباره همین شناسه را وارد کنید.</p>}
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
