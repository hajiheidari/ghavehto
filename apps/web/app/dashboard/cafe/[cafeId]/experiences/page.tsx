import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getOwnerExperiences,panelId} from '../../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'تجربه‌های کافه',robots:{index:false,follow:false}};
const digits=new Intl.NumberFormat('fa-IR');
const dates=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'});
export default async function ExperiencePanel({params,searchParams}:{params:Promise<{cafeId:string}>;searchParams:Promise<{after?:string|string[]}>}) {
  const {cafeId}=await params;if(!panelId(cafeId))notFound();
  const query=await searchParams;
  const result=await getOwnerExperiences(cafeId,typeof query.after==='string'?query.after:undefined);
  return <section className="section empty"><Link href="/dashboard/cafe">بازگشت به کافه‌های من</Link><h1>تجربه‌های کافه</h1>
    <p>نمای خصوصی تنظیمات تجربه‌ها، ویژهٔ مالک کافه.</p>
    {result.state==='signed-out'?<p>برای مشاهدهٔ تجربه‌ها به ورود معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">اطلاعات تجربه‌ها در دسترس نیست یا مجوز مالک ندارید.</p>:
      result.data.items.length===0?<p>هنوز تجربهٔ تنظیم‌شده‌ای در این کافه ندارید.</p>:
      <div>{result.data.items.map(item=><article key={item.experienceId}>
        <h2>{item.title??'تجربهٔ بدون عنوان'}</h2><p>{item.active?'تنظیم فعال':'غیرفعال'}</p>
        <dl><dt>شعبه</dt><dd>{item.branchId?(item.branchName||'شعبهٔ انتخاب‌شده'):'همهٔ شعبه‌های کافه'}</dd>
          <dt>بازهٔ مشارکت</dt><dd>{dates.format(new Date(item.startsAt))} تا {dates.format(new Date(item.endsAt))}</dd>
          <dt>ظرفیت باقی‌مانده</dt><dd>{digits.format(item.remainingStock)}</dd>
          <dt>بودجهٔ مشارکت باقی‌مانده</dt><dd>{digits.format(BigInt(item.remainingBudgetUnits))} واحد</dd>
          <dt>سقف مشارکت هر عضو</dt><dd>{digits.format(item.perMemberLimit)}</dd>
          <dt>شرط سابقه</dt><dd>{item.firstRecordedVisitOnly?'فقط نخستین مشارکت ثبت‌شده در این کافه':'بدون شرط نخستین مشارکت'}</dd>
        </dl></article>)}</div>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{pathname:`/dashboard/cafe/${cafeId}/experiences`,query:{after:result.data.nextCursor}}}>صفحه بعد</Link>}
  </section>;
}
