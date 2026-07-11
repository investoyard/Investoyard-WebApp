/** Deterministic colored "logo" mark from a company symbol/name — gives each
    IPO a stable visual identity in lists, detail and apply (enterprise dashboard feel). */

const GRADIENTS = [
  'linear-gradient(135deg,#4a3a95,#2a2052)',
  'linear-gradient(135deg,#0e7c8b,#0a4f5e)',
  'linear-gradient(135deg,#b8860b,#7a5800)',
  'linear-gradient(135deg,#9c2f7a,#5e1c4d)',
  'linear-gradient(135deg,#1f7a4d,#0f5132)',
  'linear-gradient(135deg,#c2502e,#7e2f18)',
  'linear-gradient(135deg,#3b5bb5,#22356e)',
  'linear-gradient(135deg,#6b3fa0,#3f2363)',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function CompanyMark({ name, symbol, size = 'md' }: {
  name: string; symbol: string; size?: 'sm' | 'md' | 'lg';
}) {
  const letters = name
    .replace(/\b(ltd|limited|industries|technologies|services|the)\b/gi, '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || symbol.slice(0, 2).toUpperCase();

  const bg = GRADIENTS[hash(symbol) % GRADIENTS.length];
  return <span className={`cmark ${size}`} style={{ background: bg }} aria-hidden="true">{letters}</span>;
}
