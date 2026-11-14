import Link from 'next/link';
import { getMyCafes } from '../../../lib/cafe-panel';

export const dynamic = 'force-dynamic';
export const metadata = {title:'کافه‌های من'};
export default async function CafePanel({searchParams}:{searchParams:Promise<{after?:string|string[]}>}) {
  const query = await searchParams;
  const after = typeof query.after==='string' ? query.after : undefined;
  const result = await getMyCafes(after);
  return <section className="section empty"><p className="eyebrow">پنل کافه</p><h1>کافه‌های من</h1>
    {result.state==='signed-out' ? <p>برای دیدن کافه‌های خود به ورود معتبر نیاز دارید. ورود پیامکی هنوز فعال نشده و هیچ داده مدیریتی نمایش داده نمی‌شود.</p> :
      result.state==='unavailable' ? <p role="status">اطلاعات کافه‌های شما فعلاً در دسترس نیست.</p> :
      result.data.items.length===0 ? <p>هنوز به کافه‌ای دسترسی ندارید.</p> :
      <ul>{result.data.items.map(cafe=><li key={cafe.cafeId}><Link href={`/dashboard/cafe/${cafe.cafeId}`}>{cafe.name}</Link>
        <p>{cafe.canManageStaff?'دسترسی مالک کافه':'دسترسی همکار کافه'}</p></li>)}</ul>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{pathname:'/dashboard/cafe',query:{after:result.data.nextCursor}}}>صفحه بعد</Link>}
  </section>;
}
