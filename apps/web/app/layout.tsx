import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';
export const metadata: Metadata = {
  title: { default: 'قهوه‌تو | دنیای قهوه، به سلیقه تو', template: '%s | قهوه‌تو' },
  description: 'کشف کافه‌های مستقل و تجربه‌های تازه قهوه. نسخه توسعه محلی قهوه‌تو.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>
    <a className="skip" href="#main">رفتن به محتوای اصلی</a>
    <header><Link href="/" className="brand">قهوه‌تو<span>GHAHVEHTO</span></Link>
    <nav aria-label="ناوبری اصلی"><Link href="/cafes">کشف کافه</Link><Link href="/dashboard/cafe">برای کافه‌ها</Link></nav><span className="dev">نسخه توسعه</span></header>
    <main id="main">{children}</main>
    <footer><strong>دنیای قهوه، به سلیقه تو</strong><p>قهوه‌تو · در حال ساخت برای دوستداران قهوه و کافه‌های مستقل</p><small>امکانات اصلی کافه‌ها و مصرف‌کنندگان رایگان می‌ماند.</small></footer>
  </body></html>;
}
