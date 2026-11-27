import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getAgentReview,getAgentReviewSubject,getPendingAgentReviews,panelId,staffPanelOrigin} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'پیش‌نویس‌های عامل',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
const kinds:Record<string,string>={research:'پژوهش',content:'محتوا',discovery:'کشف',outreach:'ارتباط'};
export default async function AgentReviews({searchParams}:{searchParams:Promise<{after?:string|string[];job?:string|string[];review?:string|string[]}>}) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') notFound();
  const {after,job,review}=await searchParams;
  if(after!==undefined&&!panelId(after)||job!==undefined&&!panelId(job)) notFound();
  if(job){
    const [result,decision]=await Promise.all([getAgentReviewSubject(job),getAgentReview(job)]);
    return <section className="section empty"><Link href="/dashboard/editorial/jobs">بازگشت به صف</Link>
      <h1>بستهٔ بازبینی عامل</h1>
      {result.state==='signed-out'?<p>نشست معتبر لازم است.</p>:result.state==='unavailable'?<p role="status">بسته در دسترس نیست یا مجوز مدیر ندارید.</p>:
        <><h2>درخواست {kinds[result.data.kind]??result.data.kind}</h2>
          <pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.data.payload,null,2)}</pre>
          <h2>خروجی پیش‌نویس</h2><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.data.result,null,2)}</pre>
          {decision.state==='unavailable'&&<p role="status">وضعیت تصمیم در دسترس نیست.</p>}
          {decision.state==='ready'&&decision.data&&<section><h2>تصمیم ثبت‌شده</h2>
            <dl><dt>تصمیم</dt><dd>{decision.data.decision==='approved'?'تأیید':'رد'}</dd>
              <dt>دلیل</dt><dd>{decision.data.reason}</dd>
              <dt>انقضا</dt><dd>{dates.format(new Date(decision.data.expiresAt))}</dd>
              <dt>اعتبار فعلی تأیید</dt><dd>{decision.data.usable?'معتبر':'فاقد اعتبار فعلی'}</dd></dl>
          </section>}
          {review==='unconfirmed'&&<p role="status">ثبت تصمیم تأیید نشد. رسید را بررسی کنید.</p>}
          {decision.state==='ready'&&decision.data===null&&staffPanelOrigin()&&<form method="post" action="/dashboard/editorial/jobs/review">
            <input type="hidden" name="jobId" value={job}/>
            <input type="hidden" name="operationId" value={randomUUID()}/>
            <label htmlFor="decision">تصمیم</label>{' '}
            <select id="decision" name="decision"><option value="approved">تأیید</option><option value="rejected">رد</option></select>{' '}
            <label htmlFor="reason">دلیل تصمیم</label>{' '}<input id="reason" name="reason" required maxLength={240}/>{' '}
            <label htmlFor="lifetime">اعتبار به ثانیه</label>{' '}<input id="lifetime" name="lifetimeSeconds" type="number" min={1} max={604800} defaultValue={86400} required/>{' '}
            <button type="submit">ثبت تصمیم بازبینی</button>
          </form>}
        </>}
    </section>;
  }
  const result=await getPendingAgentReviews(after);
  return <section className="section empty"><Link href="/dashboard/editorial">اسناد محتوا</Link><h1>پیش‌نویس‌های در انتظار بازبینی</h1>
    {result.state==='signed-out'?<p>نشست معتبر لازم است.</p>:result.state==='unavailable'?<p role="status">صف در دسترس نیست یا مجوز مدیر ندارید.</p>:
      <>{result.data.items.length===0?<p>پیش‌نویسی در انتظار بازبینی نیست.</p>:<ul>{result.data.items.map(item=><li key={item.jobId}>
        <Link href={{pathname:'/dashboard/editorial/jobs',query:{job:item.jobId}}}>{kinds[item.kind]??item.kind} · <bdi>{item.jobId}</bdi></Link>
        {item.paused&&<span> · عامل متوقف است</span>}
      </li>)}</ul>}
      {result.data.nextCursor&&<Link href={{pathname:'/dashboard/editorial/jobs',query:{after:result.data.nextCursor}}}>صفحهٔ بعد</Link>}</>}
  </section>;
}
