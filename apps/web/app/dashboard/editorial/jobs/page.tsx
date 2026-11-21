import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getAgentReviewSubject,getPendingAgentReviews,panelId} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'پیش‌نویس‌های عامل',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const kinds:Record<string,string>={research:'پژوهش',content:'محتوا',discovery:'کشف',outreach:'ارتباط'};
export default async function AgentReviews({searchParams}:{searchParams:Promise<{after?:string|string[];job?:string|string[]}>}) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') notFound();
  const {after,job}=await searchParams;
  if(after!==undefined&&!panelId(after)||job!==undefined&&!panelId(job)) notFound();
  if(job){
    const result=await getAgentReviewSubject(job);
    return <section className="section empty"><Link href="/dashboard/editorial/jobs">بازگشت به صف</Link>
      <h1>بستهٔ بازبینی عامل</h1>
      {result.state==='signed-out'?<p>نشست معتبر لازم است.</p>:result.state==='unavailable'?<p role="status">بسته در دسترس نیست یا مجوز مدیر ندارید.</p>:
        <><h2>درخواست {kinds[result.data.kind]??result.data.kind}</h2>
          <pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.data.payload,null,2)}</pre>
          <h2>خروجی پیش‌نویس</h2><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.data.result,null,2)}</pre></>}
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
