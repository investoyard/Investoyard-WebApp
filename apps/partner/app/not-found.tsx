import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 32, margin: 0 }}>Page not found</h1>
      <p style={{ color: 'var(--muted)', marginTop: 12 }}>The page you are looking for does not exist or has moved.</p>
      <p style={{ marginTop: 24 }}>
        <Link href="/" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>Go to IPOs</Link>
      </p>
    </div>
  );
}
