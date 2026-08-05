import { Controller, Get, Headers, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { WhatsappService } from './whatsapp.service';

/**
 * Meta WhatsApp Business Cloud webhook. With the global 'api' prefix this resolves to:
 *   GET/POST  /api/webhooks/whatsapp
 * Give Meta that URL (behind Cloudflare: https://newipoapi.finwave.co/api/webhooks/whatsapp).
 *
 * Public (no JWT) by design — the caller is Meta, not a logged-in operator. Inbound
 * authenticity is enforced by verifyChallenge (GET) + the X-Hub-Signature-256 HMAC (POST).
 */
@Controller('webhooks/whatsapp')
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  /** Verification handshake Meta runs once when you set/verify the callback URL. */
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const echo = await this.wa.verifyChallenge(mode, token, challenge);
    if (echo !== null) res.status(200).type('text/plain').send(echo);
    else res.status(403).send('Forbidden');
  }

  /** Inbound messages + status callbacks. Ack fast; process asynchronously. */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const ok = await this.wa.verifySignature(req.rawBody, signature);
    if (!ok) return { status: 'invalid_signature' };
    // Fire-and-forget: Meta expects a 200 within seconds or it retries the delivery.
    void this.wa.handleInbound(req.body).catch(() => undefined);
    return { status: 'received' };
  }
}
