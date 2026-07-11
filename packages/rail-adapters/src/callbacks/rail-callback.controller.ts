/**
 * RailCallbackController — NestJS endpoints the NSE host calls.
 * Mount under the version base the rail expects, e.g. /v1.
 *
 *   POST /v1/appdpstatus     ← DP verification status
 *   POST /v1/apppaystatus    ← UPI payment status
 *   POST /v1/notification    ← host notifications
 *
 * Protect with RailCallbackGuard (Authorization = base64(SHA256(SHA1(password)))).
 * Always respond { status: "success" } / { status: "failed", reason } as the doc requires.
 */
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  AppDpStatusRequest,
  AppPayStatusRequest,
  CallbackAck,
  NotificationRequest,
} from './rail-callback.dto';
import { RailCallbackService } from './rail-callback.service';
// import { RailCallbackGuard } from './rail-callback.auth';

@Controller('v1')
// @UseGuards(RailCallbackGuard)
export class RailCallbackController {
  constructor(private readonly svc: RailCallbackService) {}

  @Post('appdpstatus')
  @HttpCode(200)
  async appDpStatus(@Body() body: AppDpStatusRequest): Promise<CallbackAck> {
    return this.svc.handleDpStatus(body);
  }

  @Post('apppaystatus')
  @HttpCode(200)
  async appPayStatus(@Body() body: AppPayStatusRequest): Promise<CallbackAck> {
    return this.svc.handlePayStatus(body);
  }

  @Post('notification')
  @HttpCode(200)
  async notification(@Body() _body: NotificationRequest): Promise<CallbackAck> {
    // log + route host notifications as needed
    return { status: 'success' };
  }
}
