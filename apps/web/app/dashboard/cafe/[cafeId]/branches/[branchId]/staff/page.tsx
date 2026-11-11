import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getBranchStaff,panelId} from '../../../../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'کارکنان شعبه'};
export default async function Staff({params,searchParams}:{
  params:Promise<{cafeId:string;branchId:string}>;
  searchParams:Promise<{after?:string|string[]}>;
}) {
  const {cafeId,branchId}=await params;
  if(!panelId(cafeId)||!panelId(branchId)) notFound();
  const query=await searchParams;
  const result=await getBranchStaff(cafeId,branchId,typeof query.after==='string'?query.after:undefined);
  return <section className="section empty">
    <Link href={`/dashboard/cafe/${cafeId}`}>بازگشت به شعبه‌ها</Link>
    <h1>کارکنان شعبه</h1>
    {result.state==='signed-out'?<p>برای دیدن کارکنان به ورود معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">فهرست کارکنان در دسترس نیست یا مجوز مالک ندارید.</p>:
      result.data.userIds.length===0?<p>هنوز دسترسی کارمندی برای این شعبه ثبت نشده است.</p>:
      <><p>شناسه حساب کارکنانی که به این شعبه دسترسی دارند:</p>
        <ul>{result.data.userIds.map(id=><li key={id}><bdi>{id}</bdi></li>)}</ul></>}
    {result.state==='ready'&&result.data.nextCursor&&<Link href={{
      pathname:`/dashboard/cafe/${cafeId}/branches/${branchId}/staff`,query:{after:result.data.nextCursor},
    }}>صفحه بعد</Link>}
  </section>;
}
