'use client';
import { useSite } from '@/components/TenantProvider';
import { Icon } from '@/components/Icon';

/**
 * The thin bar above the header: the way back to the broker's own platform.
 *
 * WHY A WHITE-LABEL NEEDS IT AND OUR OWN SITE DOES NOT. A partner's client does
 * not arrive here first — they arrive from their broker's trading platform,
 * follow an IPO link, and then have no way back except the browser button. Our
 * own visitors are already where they meant to be, which is why `showUtility`
 * is off by default and we never render this.
 *
 * A CLIENT COMPONENT BY NECESSITY, not by preference. The site is a static
 * export, so the server render cannot know whose domain it is on; the links are
 * navigation chrome rather than indexable content, so unlike the hero there is
 * nothing lost by resolving them after hydration.
 *
 * Renders NOTHING unless the partner turned it on AND gave it somewhere to
 * point — `resolveSite` makes that one decision so this component cannot hold a
 * second opinion about it. A bar with no links in it is a bar with nothing in
 * it, and an empty strip above the header reads as a broken page.
 *
 * THE LANGUAGE SWITCH FROM THE DESIGN IS DELIBERATELY ABSENT. The design puts
 * EN / हिंदी here, and the web switcher has been hidden since 2026-10-22 — the
 * Hindi pages still build and still resolve, but the control is off on the
 * operator's instruction. Rendering one here would quietly undo that decision
 * on every partner domain.
 */
export function SiteUtilityBar() {
  const site = useSite();
  if (!site.utility) return null;
  const { mainSiteUrl, supportUrl } = site.utility;

  return (
    <div className="tpl-util">
      <div className="tpl-util-in">
        {mainSiteUrl && (
          <a className="tpl-util-link" href={mainSiteUrl}>
            <Icon name="chevron-left" size={13} aria-hidden />
            Back to main site
          </a>
        )}
        <span className="tpl-util-sp" />
        {supportUrl && (
          <a className="tpl-util-link" href={supportUrl}>Support</a>
        )}
      </div>
    </div>
  );
}
