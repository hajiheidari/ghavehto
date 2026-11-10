import Link from 'next/link';
import { getDirectory } from '../../lib/api';
import './directory.css';

export const metadata = { title: 'کشف کافه' };
export const dynamic = 'force-dynamic';

export default async function Cafes({searchParams}: {searchParams:Promise<{q?:string|string[]; page?:string|string[]}>}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0,80) : '';
  const page = typeof params.page === 'string' && /^(?:[1-9]\d?|100)$/.test(params.page) ? Number(params.page) : 1;
  const result = await getDirectory(q,page).catch(() => null);
  const href = (p:number) => ({pathname:'/cafes',query:{...(q ? {q} : {}),page:p}});
  return <section className="section empty">
    <p className="eyebrow">کشف کافه</p>
    <h1>کافه‌ها را پیدا کن</h1>
    <form action="/cafes" method="get" className="directory-search">
      <label htmlFor="cafe-search">نام کافه، شعبه، شهر یا محله</label>
      <input id="cafe-search" type="search" name="q" defaultValue={q} maxLength={80}/>
      <button className="button" type="submit">جست‌وجو</button>
    </form>
    {!result ? <p role="status">فهرست کافه‌ها فعلاً در دسترس نیست.</p> : result.items.length === 0 ?
      <p role="status">{q ? 'کافه‌ای با این جست‌وجو پیدا نشد.' : 'هنوز کافه‌ای برای نمایش در فهرست منتشر نشده است.'}</p> :
      <ul className="directory-results">{result.items.map(item => <li key={item.id}>
        <h2>{item.cafeName}</h2>
        <p>{[item.branchName,item.province,item.city,item.neighborhood].filter(Boolean).join(' · ')}</p>
      </li>)}</ul>}
    {result && (page > 1 || result.hasMore) && <nav aria-label="صفحه‌های فهرست">
      {page > 1 && <Link href={href(page-1)}>صفحه قبل</Link>}
      {result.hasMore && <Link href={href(page+1)}>صفحه بعد</Link>}
    </nav>}
    <p>نمایش یک کافه در فهرست، به معنی عضویت در برنامه وفاداری نیست.</p>
  </section>;
}
