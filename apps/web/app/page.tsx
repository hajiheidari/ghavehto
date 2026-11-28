import Link from 'next/link';
import { getBootstrap } from '../lib/api';
export const dynamic = 'force-dynamic';
export default async function Home() {
  let connected = false;
  try { await getBootstrap(); connected = true; } catch { /* Honest degraded state; no fabricated data. */ }
  return <><section className="hero"><div className="intro"><p className="eyebrow">هر فنجان، شروع یک کشف</p>
    <h1>قهوه فقط یک نوشیدنی نیست.<br/><em>دنیای توست.</em></h1>
    <p className="lede">از کافه‌های مستقل تا طعم‌های تازه؛ جایی برای پیدا کردن تجربه‌ای که به سلیقه تو نزدیک‌تر است.</p>
    <Link href="/cafes" className="button">کشف دنیای قهوه <span aria-hidden="true">←</span></Link>
    <p className="connection" role="status">{connected ? 'ارتباط وب با API مشترک برقرار است' : 'API در دسترس نیست؛ سرویس محلی را راه‌اندازی کنید'}</p>
  </div><div className="coffee-art" role="img" aria-label="تصویر انتزاعی فنجان قهوه"><div className="ring r1"/><div className="ring r2"/><div className="cup"><div className="coffee"/></div><span className="art-label">YOUR WORLD<br/>OF COFFEE</span></div></section>
  <section className="section"><p className="eyebrow">با سلیقه خودت کشف کن</p><h2>فراتر از یک فنجان همیشگی</h2><div className="features">
    <article><span className="number">۰۱</span><h3>کافه‌های مستقل</h3><p>مکان‌هایی با داستان و شخصیت خودشان؛ با اطلاعات روشن و وضعیت تأیید مشخص.</p></article>
    <article><span className="number">۰۲</span><h3>تجربه‌های اختصاصی</h3><p>چشیدن طعم تازه و آشنایی با دنیای قهوه. این بخش در مراحل بعد فعال می‌شود.</p></article>
    <article><span className="number">۰۳</span><h3>وفاداری به سلیقه تو</h3><p>کارت مهر مستقل هر کافه، ستاره‌های قهوه‌تو و سطح عضویت؛ با حساب‌های جداگانه.</p></article>
  </div></section><section className="owner"><div><p className="eyebrow">برای صاحبان کافه</p><h2>داستان کافه‌ات را<br/>به آدم‌های تازه برسان.</h2><p>ابزارهای اصلی مدیریت و حضور کافه، همیشه رایگان.</p></div><Link href="/dashboard/cafe" className="button secondary">آشنایی با پنل کافه ←</Link></section></>;
}
