import {notFound} from 'next/navigation';
import {notificationPreferences,staffPanelOrigin} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'ترجیحات اعلان',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Preferences({searchParams}:{searchParams:Promise<{result?:string|string[]}>}) {
  if(process.env.PRIVATE_PREFERENCES_VIEW!=='1') notFound();
  const {result:feedback}=await searchParams;
  const result=await notificationPreferences();
  return <section className="section empty"><h1>اعلان‌های درون‌برنامه‌ای</h1>
    {result.state==='signed-out'?<p>برای تنظیم ترجیحات به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">ترجیحات در دسترس نیستند.</p>:
      <>{feedback==='saved'&&<p role="status">ترجیحات ذخیره شد.</p>}
        {feedback==='unconfirmed'&&<p role="status">ذخیره تأیید نشد. آخرین تنظیمات را بررسی کنید.</p>}
        {staffPanelOrigin()&&<form method="post" action="/dashboard/preferences/change">
          <input type="hidden" name="expectedRevision" value={result.data.revision}/>
          <label htmlFor="loyalty">خبرهای وفاداری</label>{' '}
          <select id="loyalty" name="loyalty" defaultValue={String(result.data.loyalty)}><option value="false">غیرفعال</option><option value="true">دریافت</option></select>{' '}
          <label htmlFor="experiences">تجربه‌های کافه</label>{' '}
          <select id="experiences" name="experiences" defaultValue={String(result.data.experiences)}><option value="false">غیرفعال</option><option value="true">دریافت</option></select>{' '}
          <label htmlFor="editorial">مطالب تازه</label>{' '}
          <select id="editorial" name="editorial" defaultValue={String(result.data.editorial)}><option value="false">غیرفعال</option><option value="true">دریافت</option></select>{' '}
          <label htmlFor="dailyLimit">حداکثر اعلان در روز</label>{' '}
          <input id="dailyLimit" name="dailyLimit" type="number" min={0} max={10} defaultValue={result.data.dailyLimit} required/>{' '}
          <p>برای دریافت اعلان، سقف روزانه را از یک تا ده انتخاب کنید.</p>
          <button type="submit">ذخیرهٔ ترجیحات</button>
        </form>}
      </>}
  </section>;
}
