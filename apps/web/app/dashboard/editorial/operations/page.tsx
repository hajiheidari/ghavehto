import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getAgentControls,staffPanelOrigin} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'کنترل‌های داخلی',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const names={research:'پژوهش',content:'محتوا',discovery:'کشف',outreach:'ارتباط'};
export default async function Operations({searchParams}:{searchParams:Promise<{result?:string|string[]}>}) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') notFound();
  const {result:feedback}=await searchParams;
  const result=await getAgentControls();
  return <section className="section empty"><Link href="/dashboard/editorial/jobs">بازگشت به صف بازبینی</Link><h1>کنترل‌های داخلی</h1>
    {result.state==='signed-out'?<p>نشست معتبر لازم است.</p>:result.state==='unavailable'?<p role="status">کنترل‌ها در دسترس نیستند یا مجوز مدیر ندارید.</p>:
      <>
        {feedback==='saved'&&<p role="status">درخواست ثبت شد.</p>}
        {feedback==='unconfirmed'&&<p role="status">ثبت تغییر تأیید نشد. وضعیت را بررسی کنید.</p>}
        {result.data.map(item=><article key={item.kind}><h2>{names[item.kind]}</h2>
          <p>{item.configured?(item.paused?'متوقف':'آمادهٔ پردازش داخلی'):'پیکربندی نشده'}</p>
          {(item.kind==='research'||item.kind==='content')&&staffPanelOrigin()&&
            <form method="post" action="/dashboard/editorial/operations/control">
              <input type="hidden" name="kind" value={item.kind}/>
              <label htmlFor={'paused-'+item.kind}>وضعیت پردازش</label>{' '}
              <select id={'paused-'+item.kind} name="paused" defaultValue={String(item.paused)}>
                <option value="true">توقف</option><option value="false">آمادهٔ پردازش داخلی</option>
              </select>{' '}
              <label htmlFor={'attempts-'+item.kind}>سقف تلاش کارهای تازه</label>{' '}
              <input id={'attempts-'+item.kind} name="attemptLimit" type="number" min={1} max={10} defaultValue={item.attemptLimit} required/>{' '}
              <label htmlFor={'reason-'+item.kind}>دلیل تغییر</label>{' '}
              <input id={'reason-'+item.kind} name="reason" maxLength={240} required/>{' '}
              <button type="submit">ثبت تنظیمات</button>
            </form>}
        </article>)}
        {staffPanelOrigin()&&<form method="post" action="/dashboard/editorial/operations/role">
          <h2>دسترسی داخلی</h2>
          <label htmlFor="userId">شناسهٔ کاربر تأییدشده</label>{' '}<input id="userId" name="userId" dir="ltr" required maxLength={36}/>{' '}
          <label htmlFor="role">نقش</label>{' '}<select id="role" name="role"><option value="editor">ویرایشگر</option><option value="operator">اپراتور</option></select>{' '}
          <label htmlFor="enabled">دسترسی</label>{' '}<select id="enabled" name="enabled"><option value="true">اعطا</option><option value="false">لغو</option></select>{' '}
          <label htmlFor="roleReason">دلیل</label>{' '}<input id="roleReason" name="reason" required maxLength={240}/>{' '}
          <button type="submit">ثبت دسترسی</button>
        </form>}
      </>}
  </section>;
}
