import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  AppDpStatusRequest,
  AppPayStatusRequest,
  CallbackAck,
  RailCallbackService,
} from '@investoyard/rail-adapters';
import { RailCallbackGuard } from './rail-callback.guard';

/**
 * Endpoints the NSE host calls to push status (Chapter 4).
 * With global prefix 'api' these resolve to /api/v1/appdpstatus etc. —
 * give the exchange this callback base when onboarding the member.
 *
 * Auth: RailCallbackGuard verifies Authorization = base64(SHA256(SHA1(password)))
 * against the active member credentials — enforced when RAIL_CALLBACK_AUTH=enabled
 * (production); pass-through in dev.
 */
@Controller('v1')
@UseGuards(RailCallbackGuard)
export class RailCallbackController {
  constructor(private readonly svc: RailCallbackService) {}

  @Post('appdpstatus')
  @HttpCode(200)
  dpStatus(@Body() body: AppDpStatusRequest): Promise<CallbackAck> {
    return this.svc.handleDpStatus(body);
  }

  @Post('apppaystatus')
  @HttpCode(200)
  payStatus(@Body() body: AppPayStatusRequest): Promise<CallbackAck> {
    return this.svc.handlePayStatus(body);
  }

  @Post('notification')
  @HttpCode(200)
  async notification(): Promise<CallbackAck> {
    return { status: 'success' };
  }
}
