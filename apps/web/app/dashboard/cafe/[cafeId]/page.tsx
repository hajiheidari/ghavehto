import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyBranches, panelId } from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'شعبه‌های کافه'};
export default async function CafeBranches({params,searchParams}:{params:Promise<{cafeId:string}>;searchParams:Promise<{after?:string|string[]}>}) {
  const {cafeId}=await params;
  if (!panelId(cafeId)) notFound();
  const query=await searchParams;
  const result=await getMyBranches(cafeId,typeof query.after==='string'?query.after:undefined);
  return <section className="section empty"><Link href="/dashboard/cafe">بازگشت به کافه‌های من</Link><h1>شعبه‌های در دسترس</h1>
    {result.state==='signed-out'?<p>برای دیدن شعبه‌ها به ورود معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">اطلاعات این کافه در دسترس نیست یا به آن دسترسی ندارید.</p>:
      result.data.items.length===0?<p>شعبه‌ای در دسترس شما نیست.</p>:
      <ul>{result.data.items.map(branch=><li key={branch.branchId}>{branch.name}{' · '}
        <Link href={`/dashboard/cafe/${cafeId}/branches/${branch.branchId}/staff`}>فهرست کارکنان (ویژه مالک)</Link>
      </li>)}</ul>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{pathname:`/dashboard/cafe/${cafeId}`,query:{after:result.data.nextCursor}}}>صفحه بعد</Link>}
  </section>;
}
