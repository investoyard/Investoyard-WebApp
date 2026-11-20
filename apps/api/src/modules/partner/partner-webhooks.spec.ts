import { createHmac } from 'node:crypto';
import { assertSafeWebhookUrl, isPrivateAddress, webhookSignature } from './partner-webhooks.service';

describe('isPrivateAddress — the SSRF guard on partner webhook URLs', () => {
  it('refuses loopback, private, link-local, CGNAT and our own LAN address', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.46.88', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('refuses the IPv6 equivalents, including an IPv4-mapped private address', () => {
    for (const ip of ['::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('allows public addresses, including our own public one', () => {
    for (const ip of ['8.8.8.8', '103.107.27.38', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});

describe('assertSafeWebhookUrl', () => {
  it('refuses plain http, credentials, localhost and a literal private address', async () => {
    await expect(assertSafeWebhookUrl('http://example.com/hook')).rejects.toThrow(/https/);
    await expect(assertSafeWebhookUrl('https://user:pw@example.com/hook')).rejects.toThrow(/username or password/);
    await expect(assertSafeWebhookUrl('https://localhost/hook')).rejects.toThrow(/public internet/);
    await expect(assertSafeWebhookUrl('https://192.168.46.88/hook')).rejects.toThrow(/public internet/);
    await expect(assertSafeWebhookUrl('https://[::1]/hook')).rejects.toThrow(/public internet/);
    await expect(assertSafeWebhookUrl('not a url')).rejects.toThrow(/not a valid URL/);
  });

  it('accepts a literal public address', async () => {
    await expect(assertSafeWebhookUrl('https://8.8.8.8/hook')).resolves.toBeInstanceOf(URL);
  });
});

describe('webhookSignature', () => {
  it('is t=<seconds>,v1=<HMAC-SHA256 of "t.body"> — what the docs tell partners to verify', () => {
    const body = '{"event":"bid.sent"}';
    const expected = createHmac('sha256', 'whsec_x').update(`1700000000.${body}`).digest('hex');
    expect(webhookSignature('whsec_x', 1700000000, body)).toBe(`t=1700000000,v1=${expected}`);
  });

  it('changes with the body, so a tampered payload fails verification', () => {
    expect(webhookSignature('k', 1, '{"a":1}')).not.toBe(webhookSignature('k', 1, '{"a":2}'));
  });
});
