import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  AppDpStatusRequest,
  AppPayStatusRequest,
  CallbackAck,
  RailCallbackService,
} from '@investoyard/rail-adapters';

/**
 * Endpoints the NSE host calls to push status (Chapter 4).
 * With global prefix 'api' these resolve to /api/v1/appdpstatus etc. —
 * give the exchange this callback base when onboarding the member.
 *
 * TODO: protect with a guard verifying Authorization = base64(SHA256(SHA1(password)))
 *       (verifyAuthHeader from @investoyard/rail-adapters), keyed to the active member.
 */
@Controller('v1')
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
