import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDirectoryBranch } from '../../../lib/api';

export const metadata = {title:'اطلاعات شعبه'};
export const dynamic = 'force-dynamic';

export default async function Branch({params}: {params:Promise<{id:string}>}) {
  const {id} = await params;
  const entry = await getDirectoryBranch(id).catch(() => undefined);
  if (entry === null) notFound();
  return <section className="section empty">
    <Link href="/cafes">بازگشت به فهرست کافه‌ها</Link>
    {entry ? <>
      <h1>{entry.cafeName}</h1>
      <h2>{entry.branchName}</h2>
      <dl>
        <dt>استان</dt><dd>{entry.province}</dd>
        <dt>شهر</dt><dd>{entry.city}</dd>
        {entry.neighborhood && <><dt>محله</dt><dd>{entry.neighborhood}</dd></>}
      </dl>
      <p>نمایش این شعبه به معنی عضویت در برنامه وفاداری نیست.</p>
    </> : <><h1>اطلاعات شعبه</h1><p role="status">اطلاعات شعبه فعلاً در دسترس نیست.</p></>}
  </section>;
}
