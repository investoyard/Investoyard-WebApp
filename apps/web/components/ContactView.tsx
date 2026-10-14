'use client';
import { useEffect } from 'react';
import { useTenant, useTenantResolved } from '@/components/TenantProvider';
import { tenantDisplayName, tenantLegalEntity, tenantIdentity, tenantContact } from '@/lib/tenants';

/**
 * /contact — who operates this site and how to reach them.
 *
 * THERE WAS NO CONTACT PAGE AT ALL before this. The site carried about, terms,
 * privacy-policy, disclaimer and faqs, and the only way to reach anyone was the
 * WhatsApp link in the footer. For a SEBI-registered broker running a
 * white-label that is not a missing nicety: an intermediary must display a
 * designated grievance redressal officer, and a page that offered OUR details
 * would route their clients' complaints to us.
 *
 * NOTHING ON THIS PAGE IS INVENTED OR INHERITED. Every block renders only when
 * the operator has entered the value behind it, and `resolveIdentity` substitutes
 * across tenants for nobody. A visitor who sees a short page is being told the
 * truth: those details have not been published yet. The admin Content panel is
 * where that gets fixed, and it reports the grievance officer as blocking.
 *
 * The statutory escalation links at the foot are the ONE thing that is the same
 * for every tenant, because they are SEBI's own and not anybody's contact
 * details.
 */
export function ContactView() {
  const tenant = useTenant();
  /* Nothing that names an entity is painted before the host has resolved — on a
     partner's domain the first render would otherwise show OUR company. See
     ResolvedContext. */
  const resolved = useTenantResolved();
  const name = tenantDisplayName(tenant);
  const entity = tenantLegalEntity(tenant);
  const id = tenantIdentity(tenant);
  const c = tenantContact(tenant);

  /* The static export bakes a generic title; the tenant is only known once the
     domain has resolved on the client. Same pattern as /subscription/v2. */
  useEffect(() => { document.title = `Contact ${name} | IPO support`; }, [name]);

  const hasSupport = resolved && !!(c.supportEmail || c.supportPhone || c.hours);
  const hasGrievance = resolved && !!(c.grievanceName || c.grievanceEmail || c.grievancePhone);
  const hasCompliance = resolved && !!(c.complianceName || c.complianceEmail || c.compliancePhone);
  const hasEntity = resolved && !!(entity || id.sebiRegistration || id.cin || id.gstin || id.registeredAddress);
  const address = resolved ? (c.officeAddress ?? id.registeredAddress) : undefined;

  return (
    <div className="trust-page">
      <h1>Contact {name}</h1>
      <p className="lead-p">
        For help with an IPO application, allotment or refund — and where to escalate if we
        have not resolved it.
      </p>

      <div className="prose">
        {hasSupport ? (
          <>
            <h2>Customer support</h2>
            <dl className="ctc-dl">
              {c.supportEmail ? (
                <>
                  <dt>Email</dt>
                  <dd><a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a></dd>
                </>
              ) : null}
              {c.supportPhone ? (
                <>
                  <dt>Phone</dt>
                  {/* tel: strips spaces and punctuation; the label keeps them. */}
                  <dd><a href={`tel:${c.supportPhone.replace(/[^\d+]/g, '')}`}>{c.supportPhone}</a></dd>
                </>
              ) : null}
              {c.hours ? (<><dt>Hours</dt><dd>{c.hours}</dd></>) : null}
            </dl>
          </>
        ) : null}

        {address ? (
          <>
            <h2>{c.officeAddress ? 'Office' : 'Registered office'}</h2>
            {/* The operator types an address as a block; newlines are the lines
                of it, so they have to survive the render. */}
            <p style={{ whiteSpace: 'pre-line' }}>{address}</p>
          </>
        ) : null}

        {hasGrievance ? (
          <>
            <h2>Grievance redressal officer</h2>
            <p>
              If support has not resolved your complaint, write to our designated grievance
              redressal officer.
            </p>
            <dl className="ctc-dl">
              {c.grievanceName ? (<><dt>Name</dt><dd>{c.grievanceName}</dd></>) : null}
              {c.grievanceEmail ? (
                <><dt>Email</dt><dd><a href={`mailto:${c.grievanceEmail}`}>{c.grievanceEmail}</a></dd></>
              ) : null}
              {c.grievancePhone ? (
                <><dt>Phone</dt><dd><a href={`tel:${c.grievancePhone.replace(/[^\d+]/g, '')}`}>{c.grievancePhone}</a></dd></>
              ) : null}
            </dl>
          </>
        ) : null}

        {hasCompliance ? (
          <>
            <h2>Compliance officer</h2>
            <dl className="ctc-dl">
              {c.complianceName ? (<><dt>Name</dt><dd>{c.complianceName}</dd></>) : null}
              {c.complianceEmail ? (
                <><dt>Email</dt><dd><a href={`mailto:${c.complianceEmail}`}>{c.complianceEmail}</a></dd></>
              ) : null}
              {c.compliancePhone ? (
                <><dt>Phone</dt><dd><a href={`tel:${c.compliancePhone.replace(/[^\d+]/g, '')}`}>{c.compliancePhone}</a></dd></>
              ) : null}
            </dl>
          </>
        ) : null}

        {hasEntity ? (
          <>
            <h2>Operating entity</h2>
            <dl className="ctc-dl">
              {entity ? (<><dt>Company</dt><dd>{entity}</dd></>) : null}
              {id.sebiRegistration ? (<><dt>SEBI registration</dt><dd>{id.sebiRegistration}</dd></>) : null}
              {id.cin ? (<><dt>CIN</dt><dd>{id.cin}</dd></>) : null}
              {id.gstin ? (<><dt>GSTIN</dt><dd>{id.gstin}</dd></>) : null}
            </dl>
          </>
        ) : null}

        {/* A page with nothing on it needs to say why, rather than looking
            broken — and must not fill the hole with somebody else's details. */}
        {resolved && !hasSupport && !hasGrievance && !hasEntity && !address ? (
          <p>
            Contact details for this site have not been published yet. You can still escalate a
            market complaint through the official channels below.
          </p>
        ) : null}

        <h2>Escalating further</h2>
        <p>
          Every investor may escalate a market complaint to the regulator, whichever platform
          they applied through:
        </p>
        <ul>
          <li>
            <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">SEBI SCORES</a>
            {' '}— the regulator&apos;s complaint redressal system.
          </li>
          <li>
            <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">SMART ODR</a>
            {' '}— online dispute resolution, after SCORES.
          </li>
        </ul>
        <p>
          {name} distributes and informs — we do not provide investment advice or buy/sell
          recommendations. For a question about a specific issue, the offer document is the
          authority.
        </p>
      </div>
    </div>
  );
}
