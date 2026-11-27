import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getDraftSubmission,panelId,staffPanelOrigin} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'درخواست پیش‌نویس داخلی',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const states={queued:'در صف',leased:'در حال پردازش',retry_wait:'در انتظار تلاش دوباره',awaiting_review:'در انتظار بازبینی انسانی',dead:'پردازش متوقف شده'};
const digits=new Intl.NumberFormat('fa-IR');
export default async function DraftIntake({searchParams}:{searchParams:Promise<{operation?:string|string[];result?:string|string[]}>}) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') notFound();
  const {operation,result:feedback}=await searchParams;
  if(operation!==undefined&&!panelId(operation)) notFound();
  const status=operation?await getDraftSubmission(operation):null;
  return <section className="section empty"><Link href="/dashboard/editorial/jobs">صف بازبینی</Link><h1>درخواست پیش‌نویس داخلی</h1>
    {status?.state==='signed-out'&&<p role="status">نشست معتبر لازم است.</p>}
    {status?.state==='unavailable'&&<p role="status">درخواست در دسترس نیست یا مجوز اپراتور ندارید.</p>}
    {feedback==='unconfirmed'&&status?.state!=='ready'&&<p role="status">ثبت درخواست تأیید نشد. با همین شناسه وضعیت را دوباره بررسی کنید.</p>}
    {status?.state==='ready'&&<dl><dt>وضعیت</dt><dd>{states[status.data.state]}</dd>
      <dt>تلاش‌ها</dt><dd>{digits.format(status.data.attempts)} از {digits.format(status.data.attemptLimit)}</dd>
      <dt>کنترل عامل</dt><dd>{status.data.paused?'متوقف':'آمادهٔ پردازش داخلی'}</dd></dl>}
    {operation&&<p>شناسهٔ درخواست <bdi>{operation}</bdi></p>}
    <form method="get"><label htmlFor="operation">بازیابی درخواست</label>{' '}
      <input id="operation" name="operation" dir="ltr" required maxLength={36} defaultValue={operation}/>{' '}
      <button type="submit">بررسی وضعیت</button></form>
    {staffPanelOrigin()&&<form method="post" action="/dashboard/editorial/submit/send">
      <h2>درخواست تازه</h2><input type="hidden" name="operationId" value={randomUUID()}/>
      <label htmlFor="kind">نوع</label>{' '}<select id="kind" name="kind"><option value="research">پژوهش</option><option value="content">محتوا</option></select>{' '}
      <label htmlFor="title">عنوان</label><input id="title" name="title" required maxLength={160}/>
      <label htmlFor="body">متن تألیفی یا دارای مجوز</label><textarea id="body" name="body" required maxLength={50000}/>
      <label htmlFor="sources">مستندات حق استفاده از منابع به قالب JSON</label><textarea id="sources" name="sources" dir="ltr" required/>
      <p>برای محتوای تألیفی rights برابر original و برای منبع دارای مجوز، rights برابر permitted همراه با نشانی HTTPS و مستندات مجوز ثبت شود.</p>
      <button type="submit">ثبت پیش‌نویس برای پردازش داخلی</button>
    </form>}
  </section>;
}
