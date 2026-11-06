'use client';
import { useSite } from '@/components/TenantProvider';

/**
 * The relationship-manager card — a named human, on the broker's own site.
 *
 * WHY THIS BLOCK EXISTS AT ALL and ours does not have one: a distribution
 * partner's edge over an app is that their client has a person to call, and the
 * designs put that person on the page. We have no RMs, so this is off by
 * default and never renders on our own channel.
 *
 * `resolveSite` decides whether it appears — on the flag AND on a name being
 * present — so a toggle switched on over an empty block renders nothing rather
 * than a card with a blank name in it. The gap list is what tells the operator
 * it is unfinished; the page must never advertise its own gap.
 *
 * THE CONTACT IS PRINTED AS GIVEN AND NOT PARSED. A broker may put a phone
 * number, an email or a booking link in that box, and guessing which — then
 * wrapping it in a `tel:` or `mailto:` — gets it wrong on the third case. It is
 * rendered as a link only when it already looks like a URL, which is the one
 * reading that cannot be wrong about intent.
 */
export function RmCard() {
  const site = useSite();
  const rm = site.rm;
  if (!rm) return null;

  const initials = rm.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const isUrl = /^(https?:)?\/\//i.test(rm.contact ?? '');

  return (
    <div className="panel tpl-rm fade-up">
      <div className="tpl-rm-who">
        <span className="tpl-rm-av" aria-hidden>{initials}</span>
        <div>
          <span className="tpl-rm-lbl">{rm.label}</span>
          <h3 className="tpl-rm-name">{rm.name}</h3>
          {rm.role && <p className="tpl-rm-role">{rm.role}</p>}
        </div>
      </div>
      {rm.blurb && <p className="tpl-rm-blurb">{rm.blurb}</p>}
      {rm.contact && (
        <p className="tpl-rm-contact">
          {isUrl
            ? <a className="btn btn-ghost" href={rm.contact}>{rm.cta ?? 'Get in touch'}</a>
            : <><span className="tpl-rm-ct">{rm.contact}</span>{rm.cta && <span className="tpl-rm-cta">{rm.cta}</span>}</>}
        </p>
      )}
    </div>
  );
}
