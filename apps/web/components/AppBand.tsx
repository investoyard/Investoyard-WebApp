'use client';
import { useSite } from '@/components/TenantProvider';
import { useTenant } from '@/components/TenantProvider';
import { tenantDisplayName } from '@/lib/tenants';
import { Icon } from '@/components/Icon';

/**
 * A band pointing at the broker's own mobile app.
 *
 * NO STORE BADGE, AND THAT IS A DELIBERATE REFUSAL rather than a thing not yet
 * done. The Play and App Store badges carry the store owners' brand conditions
 * on how they may be shown, and we would be rendering them on behalf of a third
 * party whose listing we have never seen — the same reason our own `/home2` app
 * teaser uses our own squircle and only the word Android. A plain labelled link
 * says the same thing and makes no claim we are not entitled to make.
 *
 * Renders nothing without a URL: `resolveSite` gates it, so a flag switched on
 * with nowhere to point produces no band rather than a dead button.
 */
export function AppBand() {
  const site = useSite();
  const tenant = useTenant();
  if (!site.appUrl) return null;

  return (
    <div className="panel tpl-app fade-up">
      <div className="tpl-app-txt">
        <h3>Apply from your phone</h3>
        <p>Track every IPO and apply in a few taps with the {tenantDisplayName(tenant)} app.</p>
      </div>
      <a className="btn btn-primary tpl-app-cta" href={site.appUrl}>
        Get the app
        <Icon name="arrow-right" size={15} aria-hidden />
      </a>
    </div>
  );
}
