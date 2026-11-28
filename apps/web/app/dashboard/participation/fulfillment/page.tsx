import {randomUUID} from 'node:crypto';
import {notFound} from 'next/navigation';
import {getFulfillmentClaim,panelId,staffPanelOrigin} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'ثبت تحویل تجربه',robots:{index:false,follow:false},referrer:'no-referrer' as const};

const labels={reserved:'در انتظار تحویل',cancelled:'لغو شده',fulfilled:'تحویل ثبت شده'};

export default async function FulfillmentPage({searchParams}:{searchParams:Promise<{claim?:string|string[];delivery?:string|string[]}>}) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') notFound();
  const {claim,delivery}=await searchParams;
  const claimId=panelId(claim)?claim.toLowerCase():null;
  const result=claimId?await getFulfillmentClaim(claimId):null;
  return <section className="section empty">
    <h1>ثبت تحویل تجربه</h1>
    <form method="get">
      <label htmlFor="claim">شناسهٔ رسید عضو</label>{' '}
      <input id="claim" name="claim" dir="ltr" required maxLength={36} defaultValue={claimId??undefined}/>{' '}
      <button type="submit">بررسی رسید</button>
    </form>
    {claim!==undefined&&!claimId&&<p role="status">شناسهٔ رسید معتبر نیست.</p>}
    {result?.state==='signed-out'&&<p role="status">برای بررسی رسید به نشست معتبر نیاز دارید.</p>}
    {result?.state==='unavailable'&&<p role="status">رسید در دسترس نیست.</p>}
    {result?.state==='ready'&&<article>
      <h2>{result.data.title??'تجربهٔ کافه'}</h2>
      <dl><dt>شعبه</dt><dd>{result.data.branchName}</dd><dt>وضعیت</dt><dd>{labels[result.data.state]}</dd></dl>
      {delivery==='unconfirmed'&&result.data.state!=='fulfilled'&&<p role="status">تحویل تأیید نشد. وضعیت رسید را بررسی کنید.</p>}
      {result.data.state==='reserved'&&staffPanelOrigin()&&
        <form method="post" action="/dashboard/participation/fulfillment/record">
          <input type="hidden" name="claimId" value={claimId??undefined}/>
          <input type="hidden" name="operationId" value={randomUUID()}/>
          <label htmlFor="deliveryReason">توضیح تحویل</label>{' '}
          <input id="deliveryReason" name="reason" required maxLength={240}/>{' '}
          <button type="submit">ثبت تحویل</button>
        </form>}
    </article>}
  </section>;
}
