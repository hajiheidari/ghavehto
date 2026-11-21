import {randomUUID} from 'node:crypto';
import RevisionForm from './revision-form';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getEditorialDocuments,getEditorialReview,getEditorialRevision,panelId,staffPanelOrigin} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'اسناد خصوصی محتوا',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const digits=new Intl.NumberFormat('fa-IR');
const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
export default async function EditorialPage({searchParams}:{searchParams:Promise<{after?:string|string[];revision?:string|string[];review?:string|string[];created?:string|string[];document?:string|string[]}>}) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') notFound();
  const {after,revision,review,created,document}=await searchParams;
  if(document!==undefined&&!panelId(document)) notFound();
  if(after!==undefined&&!panelId(after)||revision!==undefined&&!panelId(revision)) notFound();
  if(revision){
    const [result,decision]=await Promise.all([getEditorialRevision(revision),getEditorialReview(revision)]);
    return <section className="section empty">
      <Link href="/dashboard/editorial">بازگشت به اسناد</Link>
      {result.state==='signed-out'?<p>برای مشاهدهٔ سند به نشست معتبر نیاز دارید.</p>:
        result.state==='unavailable'?<p role="status">سند در دسترس نیست یا مجوز ویرایشگر ندارید.</p>:
        <article><h1>{result.data.title}</h1><p>نسخهٔ {digits.format(result.data.revision)}</p>
          <div style={{whiteSpace:'pre-wrap'}}>{result.data.body}</div>
          <h2>مستندات منابع</h2>
          <pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.data.sources,null,2)}</pre>
          {review==='saved'&&<p role="status">تصمیم بازبینی ثبت شد.</p>}
          {review==='unconfirmed'&&<p role="status">ثبت تصمیم تأیید نشد. دسترسی یا تصمیم قبلی را بررسی کنید.</p>}
          {decision.state==='unavailable'&&<p role="status">وضعیت بازبینی در دسترس نیست.</p>}
          {decision.state==='ready'&&decision.data&&<section>
            <h2>تصمیم ثبت‌شده</h2>
            <dl><dt>تصمیم</dt><dd>{decision.data.decision==='approved'?'تأیید':'رد'}</dd>
              <dt>دلیل</dt><dd>{decision.data.reason}</dd>
              <dt>ثبت</dt><dd>{dates.format(new Date(decision.data.createdAt))}</dd>
              <dt>انقضا</dt><dd>{dates.format(new Date(decision.data.expiresAt))}</dd>
              <dt>اعتبار فعلی تأیید</dt><dd>{decision.data.usable?'معتبر':'فاقد اعتبار فعلی'}</dd>
            </dl>
          </section>}
          {staffPanelOrigin()&&decision.state==='ready'&&decision.data===null&&<form method="post" action="/dashboard/editorial/review">
            <input type="hidden" name="revisionId" value={revision}/>
            <input type="hidden" name="operationId" value={randomUUID()}/>
            <label htmlFor="decision">تصمیم بازبینی</label>{' '}
            <select id="decision" name="decision"><option value="approved">تأیید</option><option value="rejected">رد</option></select>{' '}
            <label htmlFor="reviewReason">دلیل تصمیم</label>{' '}
            <input id="reviewReason" name="reason" required maxLength={240}/>{' '}
            <label htmlFor="lifetime">اعتبار تصمیم به ثانیه</label>{' '}
            <input id="lifetime" name="lifetimeSeconds" type="number" min={1} max={604800} defaultValue={86400} required/>{' '}
            <button type="submit">ثبت تصمیم</button>
            <p>بازبینی باید توسط فردی مستقل از نویسنده انجام شود. مدت اعتبار حداکثر هفت روز است.</p>
          </form>}
          {staffPanelOrigin()&&<RevisionForm documentId={result.data.documentId} revision={result.data.revision} title={result.data.title} body={result.data.body} sources={result.data.sources}/>}
        </article>}
    </section>;
  }
  if(document&&staffPanelOrigin()) return <section className="section empty">
    <Link href="/dashboard/editorial">بازگشت به اسناد</Link><h1>نسخهٔ نخست سند</h1>
    <RevisionForm documentId={document}/>
  </section>;
  const result=await getEditorialDocuments(after);
  return <section className="section empty"><h1>اسناد خصوصی محتوا</h1>
    <Link href="/dashboard/editorial/jobs">صف بازبینی عامل‌ها (ویژهٔ مدیر)</Link>
    {staffPanelOrigin()&&result.state==='ready'&&<form method="post" action="/dashboard/editorial/document">
      <h2>ایجاد سند</h2>
      <input type="hidden" name="documentId" value={randomUUID()}/>
      <label htmlFor="slug">نام مسیر سند</label>{' '}
      <input id="slug" name="slug" dir="ltr" pattern="[a-z0-9][a-z0-9-]{0,119}" required maxLength={120}/>{' '}
      <button type="submit">ایجاد سند</button>
    </form>}
    {result.state==='ready'&&created==='saved'&&<p role="status">سند ایجاد شد.</p>}
    {result.state==='ready'&&created==='unconfirmed'&&<p role="status">ایجاد سند تأیید نشد. فهرست را بررسی کنید.</p>}
    {result.state==='signed-out'?<p>برای مشاهدهٔ اسناد به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">اسناد در دسترس نیستند یا مجوز ویرایشگر ندارید.</p>:
      <>
        {result.data.items.length===0?<p>هنوز سندی ثبت نشده است.</p>:<ul>{result.data.items.map(item=><li key={item.documentId}>
          {item.revisionId?<Link href={{pathname:'/dashboard/editorial',query:{revision:item.revisionId}}}>{item.title}</Link>:<Link href={{pathname:'/dashboard/editorial',query:{document:item.documentId}}}>{item.slug} — بدون نسخه</Link>}
          {item.revisionId&&<span> · نسخهٔ {digits.format(item.revision)}</span>}
        </li>)}</ul>}
        {result.data.nextCursor&&<Link href={{pathname:'/dashboard/editorial',query:{after:result.data.nextCursor}}}>صفحهٔ بعد</Link>}
      </>}
  </section>;
}
