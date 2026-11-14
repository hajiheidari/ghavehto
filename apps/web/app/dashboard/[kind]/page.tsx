import { notFound } from 'next/navigation';
const titles: Record<string, string> = { cafe: 'پنل کافه', admin: 'مدیریت پلتفرم', agents: 'مدیریت عامل‌ها' };
export default async function Dashboard({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!Object.hasOwn(titles, kind)) notFound();
  return <section className="section empty"><p className="eyebrow">دسترسی محافظت‌شده</p><h1>{titles[kind]}</h1><p>ورود امن و تأیید دسترسی هنوز فعال نشده است. در این نسخه هیچ داده مدیریتی نمایش داده نمی‌شود.</p></section>;
}
