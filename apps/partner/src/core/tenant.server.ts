import * as st from '@investoyard/shared-types';
import type { RawTenant } from './data.server';

/*
 * WHO IS THIS SITE FOR — decided before first paint.
 *
 * Every partner on a variant is served the same HTML, so the partner is
 * resolved in the browser from the hostname. The registry is baked into a
 * small inline script at build time, which:
 *   - picks the partner by domain (or by ?brand=<slug> for a preview),
 *   - sets the brand CSS variables on <html> so no colour flashes,
 *   - publishes the partner's identity on window.__PARTNER__ for React.
 *
 * THE IDENTITY RULE: a partner never inherits ours. Legal name, SEBI number,
 * address and grievance contact come from the partner's own content or are
 * not published at all — resolveIdentity() in shared-types is the one place
 * that decides it, and this file only carries its answer.
 */

export interface PartnerIdentity {
  slug: string;
  name: string;
  domains: string[];
  brand: string;
  logo: string | null;
  /** The logo the partner uploaded for a DARK footer (usually a white version). Null when none. */
  footerLogo: string | null;
  legalName: string | null;
  sebi: string | null;
  cin: string | null;
  address: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  grievanceName: string | null;
  grievanceEmail: string | null;
  grievancePhone: string | null;
  gmp: boolean;
  preview: boolean;
}

/**
 * Shown only when the host matches no partner — a local preview or a preview
 * host. A production partner domain always matches its tenant. Clearly a
 * sample: no legal name, no registration number.
 */
export const PREVIEW_IDENTITY: PartnerIdentity = {
  slug: 'preview', name: 'Meru Securities', domains: [], brand: '#0E6E66', logo: null, footerLogo: null,
  legalName: null, sebi: null, cin: null, address: null, supportEmail: null, supportPhone: null,
  grievanceName: null, grievanceEmail: null, grievancePhone: null, gmp: false, preview: true,
};

export function partnerRegistry(tenants: RawTenant[]): PartnerIdentity[] {
  return tenants
    .filter((t) => t.type !== 'direct')
    .map((t) => {
      const content = t.content || {};
      const id = st.resolveIdentity({ isDefault: false, name: t.name, identity: content.identity });
      const contact = st.resolveContact(content.contact);
      const dom = (t.customDomain || '').trim().toLowerCase();
      return {
        slug: t.slug,
        name: st.displayName({ isDefault: false, name: st.shortName(t.name), identity: content.identity }),
        domains: dom ? [dom, dom.startsWith('www.') ? dom.slice(4) : `www.${dom}`] : [],
        brand: t.brandColor || '#0E6E66',
        logo: t.logoUrl || null,
        footerLogo: t.footerLogoUrl || null,
        legalName: id.legalName ?? null,
        sebi: id.sebiRegistration ?? null,
        cin: id.cin ?? null,
        address: id.registeredAddress ?? null,
        supportEmail: contact.supportEmail ?? null,
        supportPhone: contact.supportPhone ?? null,
        grievanceName: contact.grievanceName ?? null,
        grievanceEmail: contact.grievanceEmail ?? null,
        grievancePhone: contact.grievancePhone ?? null,
        gmp: !!(t.flags && t.flags.gmpEnabled),
        preview: false,
      };
    });
}

/*
 * The pre-paint script. Plain ES5 so it runs before any bundle, and the brand
 * maths mirrors the design system: link text is darkened until it clears
 * 4.5:1 on white, button text is white or ink by contrast, and the tints are
 * the brand mixed toward white — so a pale partner colour never produces
 * unreadable links.
 */
export function prepaintScript(registry: PartnerIdentity[]): string {
  const reg = JSON.stringify(registry).replace(/</g, '\\u003c');
  const fallback = JSON.stringify(PREVIEW_IDENTITY);
  return [
    '(function(){',
    'var R=' + reg + ',F=' + fallback + ';',
    'function rgb(h){h=String(h||"").replace("#","");if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];var n=parseInt(h,16);if(h.length!==6||isNaN(n))n=945766;return[(n>>16)&255,(n>>8)&255,n&255];}',
    'function hex(c){return"#"+c.map(function(v){var s=Math.max(0,Math.min(255,Math.round(v))).toString(16);return s.length<2?"0"+s:s;}).join("");}',
    'function mix(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}',
    'function lum(c){var r=c.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return .2126*r[0]+.7152*r[1]+.0722*r[2];}',
    'function con(a,b){var x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}',
    'var q=null,s=null;try{q=new URLSearchParams(location.search).get("brand");if(q)sessionStorage.setItem("pw_brand",q);s=q||sessionStorage.getItem("pw_brand");}catch(e){}',
    'var h=location.hostname.toLowerCase(),t=null;',
    'for(var i=0;i<R.length;i++){var x=R[i];if(s?x.slug===s:x.domains.indexOf(h)>=0){t=x;break;}}',
    'if(!t)t=F;window.__PARTNER__=t;',
    'var b=rgb(t.brand),W=[255,255,255],K=[0,0,0],ink=b,k=0;while(con(ink,W)<4.6&&k<24){ink=mix(ink,K,.08);k++;}',
    'var d=document.documentElement,st=d.style;',
    'st.setProperty("--brand",hex(b));st.setProperty("--brand-ink",hex(ink));',
    'st.setProperty("--brand-on",con(b,W)>=4.5?"#FFFFFF":"#0D1117");',
    'st.setProperty("--brand-tint",hex(mix(W,b,.08)));st.setProperty("--brand-soft",hex(mix(W,b,.18)));',
    'st.setProperty("--brand-rgb",b.join(","));',
    /* A dark variant needs the opposite correction: lighten until the colour reads on its lightest dark panel. */
    'var D=[21,27,36],lite=b,j=0;while(con(lite,D)<4.6&&j<24){lite=mix(lite,W,.08);j++;}st.setProperty("--brand-lite",hex(lite));',
    'd.setAttribute("data-partner",t.slug);',
    '})();',
  ].join('');
}
