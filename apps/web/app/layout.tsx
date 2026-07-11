import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { ChromeWrapper } from '@/components/ChromeWrapper';
import { PwaRegister } from '@/components/PwaRegister';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Investoyard — IPO information & application platform, India',
  description:
    'Track every Mainboard and SME IPO in India — dates, price band, live subscription, GMP and allotment. Apply for yourself and your family with your own PAN, demat and UPI.',
  applicationName: 'Investoyard',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.ico', shortcut: '/favicon.ico', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Investoyard', statusBarStyle: 'default' },
  openGraph: { title: 'Investoyard', description: 'India’s IPO companion — track & apply, the easy way.' },
};

export const viewport: Viewport = {
  themeColor: '#3c2e7e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        <ChromeWrapper>{children}</ChromeWrapper>
        <PwaRegister />
      </body>
    </html>
  );
}
