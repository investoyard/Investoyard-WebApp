/**
 * Welcome email — sent when a partner or branch application is approved,
 * and again if the operator hits "Re-send activation" from the review
 * panel.
 *
 * Design notes:
 *  • The email is what a partner reads BEFORE they know anything about
 *    us. It has to answer three questions inside the first paragraph:
 *    what happened, what to click, what happens after that click. The
 *    button is centred and generous — email clients that strip button
 *    styles still show it as a normal link, and a fallback "or copy
 *    this URL" line is always present because Outlook and some webmail
 *    clients silently break certain anchor targets.
 *  • Inline styles only. Most email clients strip <style> blocks; some
 *    strip <head> entirely. Every visual property is set on the
 *    element that needs it.
 *  • Brand indigo (#3c2e7e) for the header + button; a single narrow
 *    gold accent (#ffcb32) below the header. No hero image — email
 *    images either need a hosted CDN or a base64 CID attachment, and
 *    the plumbing for either is out of scope for the first send.
 *  • Text/plain fallback carries the same core sentence and URL, so a
 *    plaintext-only inbox is not left staring at a blank message.
 *  • Deliberate omission: no password in the email. The activation link
 *    is the credential; landing on /partner/activate is where the
 *    partner sets a password of their own choosing. Emailing a
 *    temporary password would create a real support burden ("I lost
 *    the email with my password") and expose the account to anyone
 *    with historical inbox access.
 */

export interface WelcomeEmailInput {
  contactName: string;
  legalName: string;
  /** the URL that lands the partner on /partner/activate?token=…       */
  activationLink: string;
  /** username they'll use once activated — printed for their reference */
  username: string;
  /** 'partner' | 'whitelabel' | 'branch'                                 */
  kind: 'partner' | 'whitelabel' | 'branch';
  /** for branches, the parent partner's display name — used in the copy */
  parentName?: string;
  /** 7 by default (matches the token expiry set in approve())            */
  linkValidDays?: number;
  /** true when the operator hits "Re-send activation" — nudges the copy
   *  from "Your account is approved" to "Here's a fresh activation link" */
  isResend?: boolean;
}

export interface WelcomeEmailBuilt {
  subject: string;
  text: string;
  html: string;
}

/** Colour tokens kept in step with the site's --brand / --gold. */
const BRAND = '#3c2e7e';
const GOLD  = '#ffcb32';
const INK   = '#1a1a1f';
const MUTED = '#5e5b6e';
const BG    = '#f4f3f8';
const CARD  = '#ffffff';
const BORDER = '#e9e7f0';

export function buildWelcomeEmail(i: WelcomeEmailInput): WelcomeEmailBuilt {
  const days = i.linkValidDays ?? 7;
  const displayLabel =
    i.kind === 'branch' ? `${i.parentName ?? 'parent'} → ${i.legalName}`
    : i.kind === 'whitelabel' ? `${i.legalName} (white-label)`
    : i.legalName;

  const subject = i.isResend
    ? 'Investoyard — fresh activation link for your partner account'
    : (i.kind === 'branch'
        ? `Welcome to Investoyard — activate your ${i.parentName ?? 'partner'} branch account`
        : 'Welcome to Investoyard — activate your partner account');

  const heading = i.isResend
    ? 'Here is a fresh activation link'
    : (i.kind === 'branch' ? 'Your branch account is ready' : 'Welcome to Investoyard');

  const opener = i.isResend
    ? `The previous activation link for your Investoyard account (${displayLabel}) has been replaced with the one below.`
    : (i.kind === 'branch'
        ? `Your branch <b>${escape(i.legalName)}</b>${i.parentName ? ` under <b>${escape(i.parentName)}</b>` : ''} has been approved on Investoyard.`
        : `Your partner application for <b>${escape(i.legalName)}</b> has been approved on Investoyard.`);

  const text = [
    `Hello ${i.contactName},`,
    '',
    i.isResend
      ? `Here is a fresh activation link for your Investoyard account (${displayLabel}).`
      : `Your Investoyard partner account for ${displayLabel} has been approved.`,
    '',
    `Activate your account and set a password:`,
    `  ${i.activationLink}`,
    '',
    `This link is valid for ${days} days. Once activated, sign in with:`,
    `  Username:  ${i.username}`,
    `  Password:  the one you set on the activation page`,
    '',
    `Need help? Reply to this email or reach out to your Investoyard relationship manager.`,
    '',
    `— Investoyard`,
    `Safal Capital Services Private Limited`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${CARD};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:${BRAND};padding:22px 28px 20px 28px;">
          <div style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:.01em;">Investoyard</div>
          <div style="color:rgba(255,255,255,.75);font-size:12px;margin-top:2px;">Partner Access</div>
        </td></tr>
        <tr><td style="background:${GOLD};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 28px 8px 28px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.2;color:${INK};font-weight:600;letter-spacing:-.01em;">${escape(heading)}</h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${MUTED};">Hello ${escape(i.contactName)},</p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${MUTED};">${opener}</p>
        </td></tr>

        <!-- Button -->
        <tr><td align="center" style="padding:8px 28px 24px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
            <a href="${escapeAttr(i.activationLink)}"
               style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;letter-spacing:.01em;">
              Activate your account
            </a>
          </td></tr></table>
        </td></tr>

        <!-- Fallback URL -->
        <tr><td style="padding:0 28px 24px 28px;">
          <p style="margin:0 0 6px 0;font-size:13px;color:${MUTED};">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;word-break:break-all;">
            <a href="${escapeAttr(i.activationLink)}" style="color:${BRAND};text-decoration:none;">${escape(i.activationLink)}</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 28px;"><hr style="border:0;border-top:1px solid ${BORDER};margin:0;"></td></tr>

        <!-- What happens next -->
        <tr><td style="padding:24px 28px 8px 28px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#908d9e;font-weight:600;margin-bottom:8px;">What happens next</div>
          <ol style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:1.6;color:${MUTED};">
            <li>Click the button above (valid for ${days} days).</li>
            <li>Set a password of your choice.</li>
            <li>Sign in with your username: <code style="background:#f4f2f8;padding:1px 6px;border-radius:3px;font-size:13px;color:${INK};">${escape(i.username)}</code></li>
          </ol>
        </td></tr>

        <!-- Support -->
        <tr><td style="padding:0 28px 28px 28px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">
            Need help? Reply to this email or reach out to your Investoyard relationship manager.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#faf9fc;padding:16px 28px;border-top:1px solid ${BORDER};text-align:center;">
          <p style="margin:0;font-size:12px;color:#908d9e;">
            Investoyard is a product of <strong style="color:${MUTED};">Safal Capital Services Private Limited</strong>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escape(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escape(s).replace(/"/g, '&quot;');
}
