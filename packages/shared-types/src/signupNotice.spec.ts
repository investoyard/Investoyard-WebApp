import { SIGNUP_NOTICES, signupNotice } from './signupNotice';

describe('signupNotice — the consent each kind of sign-up records', () => {
  it('keeps the client version stored on every existing account', () => {
    expect(SIGNUP_NOTICES.client.version).toBe('service-v1');
    expect(SIGNUP_NOTICES.client.channel).toBe('signup');
  });

  it('gives a partner its own version and channel, distinct from the client one', () => {
    expect(SIGNUP_NOTICES.partner.version).toBe('partner-signup-v1');
    expect(SIGNUP_NOTICES.partner.version).not.toBe(SIGNUP_NOTICES.client.version);
    expect(SIGNUP_NOTICES.partner.channel).toBe('partner-signup');
  });

  it('says what a partner is agreeing to, not IPO applications', () => {
    expect(SIGNUP_NOTICES.partner.text).toMatch(/partner application/);
    expect(SIGNUP_NOTICES.partner.text).not.toMatch(/IPO applications/);
  });

  it('treats a missing or unknown purpose as an ordinary client sign-up', () => {
    expect(signupNotice()).toBe(SIGNUP_NOTICES.client);
    expect(signupNotice(null)).toBe(SIGNUP_NOTICES.client);
    expect(signupNotice('admin')).toBe(SIGNUP_NOTICES.client);
    expect(signupNotice('partner')).toBe(SIGNUP_NOTICES.partner);
  });
});
