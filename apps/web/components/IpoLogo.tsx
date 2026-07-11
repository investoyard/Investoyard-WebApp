/** Company logo tile for IPO cards. Shows the real logo image; a neutral
    placeholder mark when no logo is available. */
export function IpoLogo({ logo, name, size = 48 }: { logo?: string; name?: string; size?: number }) {
  return (
    <span className="ipologo" style={{ width: size, height: size }}>
      {logo ? (
        <img src={logo} alt={name ?? ''} />
      ) : (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 21V6l7-3 7 3v15" /><path d="M4 21h16" /><path d="M9 21v-4h6v4M8 9h1M8 13h1M15 9h1M15 13h1" />
        </svg>
      )}
    </span>
  );
}
