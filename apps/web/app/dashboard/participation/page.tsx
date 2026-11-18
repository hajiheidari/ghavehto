import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getParticipationHistory,getParticipationOffer,getParticipationReceipt,panelId,participationEligibility,participationVersion,staffPanelOrigin} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'رسید مشارکت',robots:{index:false,follow:false},referrer:'no-referrer' as const};

const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
const labels={reserved:'رزرو شده',cancelled:'لغو شده',fulfilled:'تحویل ثبت شده'};

export default async function ParticipationPage({searchParams}:{searchParams:Promise<{operation?:string|string[];experience?:string|string[];branch?:string|string[];version?:string|string[];reservation?:string|string[];cancellation?:string|string[];after?:string|string[]}>}) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') notFound();
  const {operation,experience,branch,version,reservation,cancellation,after}=await searchParams;
  const versionNumber=participationVersion(version);
  const [result,offer,history]=await Promise.all([
    panelId(operation)?getParticipationReceipt(operation):null,
    panelId(experience)&&panelId(branch)&&versionNumber!==null?getParticipationOffer(experience,branch,versionNumber):null,
    operation===undefined&&experience===undefined&&(after===undefined||panelId(after))?getParticipationHistory(after):null,
  ]);
  return <section className="section empty">
    <h1>رسید مشارکت</h1>
    {(operation!==undefined||experience!==undefined)&&<Link href="/dashboard/participation">مشارکت‌های من</Link>}
    {after!==undefined&&!panelId(after)&&<p role="status">شناسهٔ صفحه معتبر نیست.</p>}
    {offer?.state==='signed-out'&&<p role="status">برای مشاهدهٔ پیشنهاد به نشست معتبر نیاز دارید.</p>}
    {offer?.state==='unavailable'&&<p role="status">پیشنهاد در دسترس نیست.</p>}
    {offer?.state==='ready'&&<article>
      <h2>{offer.data.title??'تجربهٔ کافه'}</h2>
      <dl>
        <dt>شعبه</dt><dd>{offer.data.branchName}</dd>
        <dt>بازهٔ رزرو</dt><dd>{dates.format(offer.data.startsAt)} تا {dates.format(offer.data.endsAt)}</dd>
        <dt>وضعیت پیشنهاد</dt><dd>{participationEligibility[offer.data.eligibility]}</dd>
      </dl>
      {offer.data.eligibility==='eligible'&&staffPanelOrigin()&&
        <form method="post" action="/dashboard/participation/reserve">
          <input type="hidden" name="experienceId" value={typeof experience==='string'?experience:undefined}/>
          <input type="hidden" name="branchId" value={typeof branch==='string'?branch:undefined}/>
          <input type="hidden" name="version" value={versionNumber??undefined}/>
          <input type="hidden" name="operationId" value={randomUUID()}/>
          <button type="submit">رزرو این تجربه</button>
        </form>}
    </article>}
    {reservation==='unconfirmed'&&result?.state==='unavailable'&&<p role="status">رزرو تأیید نشد. برای بررسی دوباره همین شناسه را وارد کنید.</p>}
    {history?.state==='signed-out'&&<p role="status">برای مشاهدهٔ مشارکت‌ها به نشست معتبر نیاز دارید.</p>}
    {history?.state==='unavailable'&&<p role="status">فهرست مشارکت‌ها در دسترس نیست.</p>}
    {history?.state==='ready'&&<section>
      <h2>مشارکت‌های من</h2>
      {history.data.items.length===0?<p>هنوز رسید مشارکتی ندارید.</p>:<ul>
        {history.data.items.map(item=><li key={item.operationId}>
          <Link href={{pathname:'/dashboard/participation',query:{operation:item.operationId}}}>{item.title??'تجربهٔ کافه'}</Link>
          {' · '}{labels[item.state]}{' · '}{dates.format(new Date(item.claimedAt))}
        </li>)}
      </ul>}
      {history.data.nextCursor&&<Link href={{pathname:'/dashboard/participation',query:{after:history.data.nextCursor}}}>رسیدهای قدیمی‌تر</Link>}
    </section>}
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
    {cancellation==='unconfirmed'&&!(result?.state==='ready'&&result.data.state==='cancelled')&&
      <p role="status">لغو رزرو تأیید نشد. وضعیت رسید را بررسی کنید.</p>}
    {result?.state==='ready'&&result.data.state==='reserved'&&panelId(operation)&&staffPanelOrigin()&&
      <form method="post" action="/dashboard/participation/cancel">
        <input type="hidden" name="reservationId" value={operation}/>
        <input type="hidden" name="operationId" value={randomUUID()}/>
        <label htmlFor="cancellationReason">دلیل لغو رزرو</label>{' '}
        <input id="cancellationReason" name="reason" required maxLength={240}/>{' '}
        <button type="submit">لغو رزرو</button>
      </form>}
  </section>;
}
