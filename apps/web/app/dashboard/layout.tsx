import Link from 'next/link';

export default function DashboardLayout({children}:{children:React.ReactNode}) {
  return <><nav aria-label="نشست کاربری"><Link href="/dashboard/session">خروج از نشست</Link></nav>{children}</>;
}
