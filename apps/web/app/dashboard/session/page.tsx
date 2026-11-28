import {cookies} from 'next/headers';
import {accessCookieName,staffPanelOrigin} from '../../../lib/cafe-panel';

export const dynamic='force-dynamic';
export const metadata={title:'خروج از نشست',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Session({searchParams}:{searchParams:Promise<{result?:string|string[]}>}) {
  const {result}=await searchParams;
  const token=(await cookies()).get(accessCookieName)?.value;
  const hasCredential=!!token&&/^[A-Za-z0-9_-]{43}$/.test(token);
  return <section className="section empty"><h1>خروج از نشست</h1>
    {result==='unconfirmed'&&<p role="status">خروج در سرور تأیید نشد. دوباره تلاش کنید.</p>}
    {hasCredential?<>
      <p>با خروج، این نشست و ادامه‌های آن در سرور لغو می‌شوند.</p>
      {staffPanelOrigin()&&<form method="post" action="/dashboard/session/logout">
        <input type="hidden" name="confirm" value="logout"/>
        <button type="submit">خروج از این نشست</button>
      </form>}
    </>:<p role="status">در این مرورگر نشستی برای ادامه وجود ندارد.</p>}
  </section>;
}
