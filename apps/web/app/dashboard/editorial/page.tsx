import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getEditorialDocuments,getEditorialRevision,panelId} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'اسناد خصوصی محتوا',robots:{index:false,follow:false},referrer:'no-referrer' as const};
const digits=new Intl.NumberFormat('fa-IR');
export default async function EditorialPage({searchParams}:{searchParams:Promise<{after?:string|string[];revision?:string|string[]}>}) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') notFound();
  const {after,revision}=await searchParams;
  if(after!==undefined&&!panelId(after)||revision!==undefined&&!panelId(revision)) notFound();
  if(revision){
    const result=await getEditorialRevision(revision);
    return <section className="section empty">
      <Link href="/dashboard/editorial">بازگشت به اسناد</Link>
      {result.state==='signed-out'?<p>برای مشاهدهٔ سند به نشست معتبر نیاز دارید.</p>:
        result.state==='unavailable'?<p role="status">سند در دسترس نیست یا مجوز ویرایشگر ندارید.</p>:
        <article><h1>{result.data.title}</h1><p>نسخهٔ {digits.format(result.data.revision)}</p>
          <div style={{whiteSpace:'pre-wrap'}}>{result.data.body}</div>
          <h2>مستندات منابع</h2>
          <pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result.data.sources,null,2)}</pre>
        </article>}
    </section>;
  }
  const result=await getEditorialDocuments(after);
  return <section className="section empty"><h1>اسناد خصوصی محتوا</h1>
    {result.state==='signed-out'?<p>برای مشاهدهٔ اسناد به نشست معتبر نیاز دارید.</p>:
      result.state==='unavailable'?<p role="status">اسناد در دسترس نیستند یا مجوز ویرایشگر ندارید.</p>:
      <>
        {result.data.items.length===0?<p>هنوز سندی ثبت نشده است.</p>:<ul>{result.data.items.map(item=><li key={item.documentId}>
          {item.revisionId?<Link href={{pathname:'/dashboard/editorial',query:{revision:item.revisionId}}}>{item.title}</Link>:<span>{item.slug} — بدون نسخه</span>}
          {item.revisionId&&<span> · نسخهٔ {digits.format(item.revision)}</span>}
        </li>)}</ul>}
        {result.data.nextCursor&&<Link href={{pathname:'/dashboard/editorial',query:{after:result.data.nextCursor}}}>صفحهٔ بعد</Link>}
      </>}
  </section>;
}
