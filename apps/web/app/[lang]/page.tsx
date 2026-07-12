import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { makeT, Lang } from '@investoyard/i18n';
import { HomeView } from '@/components/views/HomeView';
import { SUPPORTED_LOCALES } from '@/lib/locales';

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  const tr = makeT(params.lang as Lang);
  return {
    title: 'Investoyard — IPO में निवेश, अब आसान',
    description: tr('home.subtitle'),
    alternates: { canonical: `/${params.lang}/`, languages: { en: '/', hi: '/hi/', 'x-default': '/' } },
  };
}

export default function LocalizedHome({ params }: { params: { lang: string } }) {
  if (!SUPPORTED_LOCALES.includes(params.lang as any)) notFound();
  return <HomeView lang={params.lang as Lang} />;
}
