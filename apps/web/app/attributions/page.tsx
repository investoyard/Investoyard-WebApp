export const metadata = {
  title: 'Data attributions | Investoyard',
  description:
    'Open data used by Investoyard — the bank, branch and IFSC directory and the pincode directory — with their licences and the changes we made.',
};

/**
 * DATA ATTRIBUTIONS — a licence condition, not a courtesy.
 *
 * The pincode directory is GeoNames under **CC BY 4.0**, which requires credit
 * and a link, AND requires that modifications be INDICATED (clause 3(a)(1)(B)).
 * We modified it substantially — one row per locality was collapsed to one row
 * per pincode by majority — so saying only "data from GeoNames" would satisfy
 * half the licence. The bank directory is razorpay/ifsc under **MIT**, which
 * requires the copyright notice and the permission notice be included; both are
 * reproduced in full below rather than linked, because that is what the licence
 * says.
 *
 * NOT A `TrustPage`, AND THAT IS THE WHOLE POINT. Every other page in this
 * family is per-tenant rich text that a white-label replaces with its own, and
 * one that is unpublished renders "not yet published". This page must do
 * neither: a partner serves the SAME directory off the SAME database, so the
 * obligation is theirs as much as ours. It is plain static markup, identical on
 * every host, and deliberately outside `[data-own-only]` — hiding it on a
 * partner's domain would leave them publishing CC-BY data with no attribution
 * anywhere.
 *
 * Linked from the footer on every page, which is how CC BY 4.0's own
 * section 3(a)(2) contemplates this being satisfied ("a URI or hyperlink to a
 * resource that includes the required information"), and GeoNames' readme says
 * so outright: "a link on your website to www.geonames.org is ok".
 *
 * Both licence texts were read from the sources themselves on 2026-10-21 —
 * raw.githubusercontent.com/razorpay/ifsc/master/LICENSE and
 * download.geonames.org/export/zip/readme.txt — not recalled. Re-read them
 * before changing a word here.
 */
export default function AttributionsPage() {
  return (
    <div className="trust-page">
      <h1>Data attributions</h1>
      <p className="lead-p">
        Some of the directories behind our forms come from open datasets. This page credits them,
        names their licences, and says what we changed.
      </p>

      <div className="prose">
        <h2>Bank, branch and IFSC directory</h2>
        <p>
          The list of banks, branches and IFSC codes offered on the applicant form comes from the{' '}
          <a href="https://github.com/razorpay/ifsc" target="_blank" rel="noopener noreferrer">
            razorpay/ifsc
          </a>{' '}
          dataset, which is derived from the Reserve Bank of India&rsquo;s published IFSC list. Used
          under the MIT licence.
        </p>
        <p className="attr-notice">
          The MIT License (MIT)
          <br />
          Copyright (c) 2020 Razorpay
          <br />
          <br />
          Permission is hereby granted, free of charge, to any person obtaining a copy of this
          software and associated documentation files (the &quot;Software&quot;), to deal in the
          Software without restriction, including without limitation the rights to use, copy, modify,
          merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
          persons to whom the Software is furnished to do so, subject to the following conditions:
          <br />
          <br />
          The above copyright notice and this permission notice shall be included in all copies or
          substantial portions of the Software.
          <br />
          <br />
          THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
          BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT
          OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
          DEALINGS IN THE SOFTWARE.
        </p>
        <p>
          <b>What we changed.</b> We imported the bank, branch, IFSC, city and state columns only, and
          we group the list so that banks with many branches are offered before the long tail of
          single-branch co-operative banks. The codes themselves are used as published.
        </p>

        <h2>Pincode directory</h2>
        <p>
          The pincode lookup that fills in city, district and state is built from the{' '}
          <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer">
            GeoNames
          </a>{' '}
          postal-code export for India, licensed under{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution 4.0 International (CC BY 4.0)
          </a>
          .
        </p>
        <p>
          <b>What we changed &mdash; this data has been modified.</b> GeoNames publishes one row per
          locality, so a single pincode appears many times and those rows do not always agree about
          the district. Our directory holds one row per pincode, taking the most frequent district
          and state. Where the localities under a pincode disagreed we keep the majority answer and{' '}
          <i>flag</i> it, and the form tells you so rather than filling the field silently. We also
          spell Puducherry by its current name, and carry Ladakh as a selectable state even though
          GeoNames still files its pincodes under Jammu &amp; Kashmir.
        </p>
        <p>
          The result is our own derived table and any error in it is ours, not GeoNames&rsquo;. Always
          check the address and bank details on an application form against your own records before
          submitting it &mdash; the registrar matches what your bank holds, not what we suggest.
        </p>
      </div>
    </div>
  );
}
