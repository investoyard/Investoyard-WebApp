export const metadata = { title: 'Not found | Investoyard' };

export default function NotFound() {
  return (
    <div className="empty fade-up" style={{ paddingTop: 80 }}>
      <div aria-hidden="true" className="emoji">🔎</div>
      <h3>Page not found</h3>
      <p className="muted">The page you’re looking for doesn’t exist or has moved.</p>
      <div style={{ marginTop: 16 }}>
        <a className="btn" href="/">Back to IPOs</a>
      </div>
    </div>
  );
}
