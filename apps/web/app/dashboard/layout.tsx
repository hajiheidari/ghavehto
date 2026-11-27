import Link from 'next/link';

export default function DashboardLayout({children}:{children:React.ReactNode}) {
  return <><nav aria-label="نشست کاربری">
    <Link href="/dashboard/session">خروج از نشست</Link>{' '}
    {process.env.PRIVATE_LOYALTY_HISTORY_VIEW==='1'&&<Link href="/dashboard/loyalty">تاریخچهٔ وفاداری</Link>}{' '}
    {process.env.PRIVATE_PREFERENCES_VIEW==='1'&&<Link href="/dashboard/preferences">ترجیحات اعلان</Link>}
  </nav>{children}</>;
}
