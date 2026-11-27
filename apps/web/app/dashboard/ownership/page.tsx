import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getOwnershipClaims,panelId,staffPanelOrigin} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'درخواست مالکیت کافه',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const labels={pending:'در انتظار بررسی',withdrawn:'پس‌گرفته‌شده',verified:'تأیید بررسی',rejected:'ردشده'};
export default async function Ownership({searchParams}:{searchParams:Promise<{branch?:string|string[];result?:string|string[];after?:string|string[]}>}) {
  if(process.env.PRIVATE_OWNERSHIP_CLAIMS_VIEW!=='1') notFound();
  const {branch,result:feedback,after}=await searchParams;
  if((branch!==undefined&&!panelId(branch))||(after!==undefined&&!panelId(after))) notFound();
  const result=await getOwnershipClaims(after as string|undefined);
  const writable=!!staffPanelOrigin();
  return <section className="section empty"><h1>درخواست مالکیت کافه</h1>
    <p>درخواست و بررسی مدارک از اعطای دسترسی مدیریتی جداست. ثبت یا تأیید درخواست به‌تنهایی دسترسی کافه ایجاد نمی‌کند.</p>
    {result.state==='signed-out'?<p>برای ثبت و پیگیری درخواست به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">درخواست‌ها فعلاً در دسترس نیستند.</p>:<>
        {feedback==='submitted'&&<p role="status">درخواست ثبت شد. وضعیت آن را در فهرست بررسی کنید.</p>}
        {feedback==='withdrawn'&&<p role="status">درخواست پس گرفته شد.</p>}
        {feedback==='unconfirmed'&&<p role="status">عملیات تأیید نشد. وضعیت فعلی فهرست را بررسی کنید.</p>}
        {writable&&<form method="post" action="/dashboard/ownership/change">
          <input type="hidden" name="operation" value="submit"/>
          <label htmlFor="branchId">شناسهٔ شعبه در فهرست بازبینی‌شده</label>{' '}
          <input id="branchId" name="branchId" defaultValue={branch} maxLength={36} dir="ltr" required/>{' '}
          <button type="submit">ثبت درخواست بررسی</button>
        </form>}
        <h2>تاریخچهٔ درخواست‌های شما</h2>
        {result.data.items.length===0?<p>{after?'درخواست قدیمی‌تری در این صفحه نیست.':'هنوز درخواستی ثبت نکرده‌اید.'}</p>:<ul>{result.data.items.map(claim=><li key={claim.claimId}>
          <p>شناسهٔ درخواست: <bdi>{claim.claimId}</bdi></p>
          <p>{labels[claim.status]} · <Link href={'/cafes/'+claim.branchId}>اطلاعات شعبه</Link></p>
          {writable&&claim.status==='pending'&&<form method="post" action="/dashboard/ownership/change">
            <input type="hidden" name="operation" value="withdraw"/><input type="hidden" name="claimId" value={claim.claimId}/>
            <button type="submit">پس‌گرفتن درخواست</button>
          </form>}
        </li>)}</ul>}
        {result.data.nextCursor&&<Link href={{pathname:'/dashboard/ownership',query:{after:result.data.nextCursor}}}>درخواست‌های قدیمی‌تر</Link>}
      </>}
  </section>;
}
