'use client';
import { useTenant } from '@/components/TenantProvider';
import { Icon } from '@/components/Icon';

/**
 * WhatsApp updates CTA — renders ONLY when the operator has configured a
 * channel URL (Admin → Tenants → settings cascade → whatsappChannel).
 * One calm band, WhatsApp's own green reserved for its button alone.
 */
/** Footer variant — a single quiet link, shown only when the channel is configured. */
export function WhatsAppFooterLink() {
  const tenant = useTenant();
  if (!tenant.flags.whatsappChannel) return null;
  return <a href={tenant.flags.whatsappChannel} target="_blank" rel="noopener noreferrer">WhatsApp updates</a>;
}

export function WhatsAppCta() {
  const tenant = useTenant();
  const url = tenant.flags.whatsappChannel;
  if (!url) return null;

  return (
    <section className="wa-band fade-up" aria-label="WhatsApp updates">
      <div className="wa-copy">
        <span className="wa-badge"><Icon name="whatsapp" size={20} /></span>
        <div>
          <div className="wa-t">IPO alerts, straight on WhatsApp</div>
          <div className="wa-s">Open · close · allotment reminders and GMP moves — no spam, leave anytime.</div>
        </div>
      </div>
      <a className="btn wa-btn" href={url} target="_blank" rel="noopener noreferrer">
        <Icon name="whatsapp" size={16} /> Join the channel
      </a>
    </section>
  );
}
