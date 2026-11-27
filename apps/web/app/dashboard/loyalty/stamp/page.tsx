import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getStampSummary,panelId} from '../../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'دفتر مهر کافه',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Stamp({searchParams}:{searchParams:Promise<{cafeId?:string|string[];programId?:string|string[];version?:string|string[]}>}) {
  if(process.env.PRIVATE_LOYALTY_HISTORY_VIEW!=='1') notFound();
  const {cafeId,programId,version}=await searchParams;
  if(!panelId(cafeId)||!panelId(programId)||typeof version!=='string'||!/^[1-9][0-9]{0,9}$/.test(version)||Number(version)>2147483647) notFound();
  const result=await getStampSummary(cafeId,programId,Number(version));
  const numbers=new Intl.NumberFormat('fa-IR');
  return <section className="section empty"><h1>دفتر مهر کافه</h1>
    {result.state==='signed-out'?<p>برای مشاهدهٔ دفتر به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">دفتر مهر فعلاً قابل‌نمایش نیست.</p>:<>
        <p>شناسهٔ کافه: <bdi>{result.data.cafeId}</bdi> · نسخهٔ برنامه: {numbers.format(result.data.programVersion)}</p>
        {result.data.availableUnits===null?<p role="status">ماندهٔ مهر فعلاً قابل‌نمایش نیست.</p>:
          <p>مهر معتبر در زمان بررسی: <bdi>{numbers.format(BigInt(result.data.availableUnits))}</bdi></p>}
        <p>مهر لازم در این نسخهٔ برنامه: {numbers.format(result.data.stampsRequired)}</p>
        <p>امکان دریافت پاداش هنگام درخواست و با بررسی موجودی و اعتبار برنامه تعیین می‌شود.</p>
        <p>زمان بررسی: <time dateTime={result.data.asOf}>{new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(result.data.asOf))}</time></p>
      </>}
    <Link href="/dashboard/loyalty?ledger=stamp">تاریخچهٔ مهرها</Link>
  </section>;
}
