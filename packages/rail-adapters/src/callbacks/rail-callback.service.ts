/**
 * RailCallbackService — applies inbound rail status callbacks to the
 * `application` record and emits user notifications.
 *
 * Framework-agnostic core; wire `ApplicationRepo` + `Notifier` to your
 * NestJS providers (TypeORM/Prisma repo + push/notification service).
 */
import {
  AppDpStatusRequest,
  AppPayStatusRequest,
  ApplicationStatus,
  CallbackAck,
  mapDpStatus,
  mapUpiStatus,
} from './rail-callback.dto';

export interface ApplicationRepo {
  /** Find by exchange symbol + application number (the keys the rail sends). */
  findBySymbolAndApplicationNo(symbol: string, applicationNumber: string): Promise<{ id: string } | null>;
  updateStatus(
    id: string,
    patch: { status: ApplicationStatus; amountBlocked?: number; reason?: string; rawEvent: unknown },
  ): Promise<void>;
}

export interface Notifier {
  /** push/in-app notification to the application owner */
  notifyApplicationStatus(applicationId: string, status: ApplicationStatus): Promise<void>;
}

export class RailCallbackService {
  constructor(
    private readonly apps: ApplicationRepo,
    private readonly notifier: Notifier,
  ) {}

  async handleDpStatus(req: AppDpStatusRequest): Promise<CallbackAck> {
    const app = await this.apps.findBySymbolAndApplicationNo(req.symbol, req.applicationNumber);
    if (!app) return { status: 'failed', reason: 'Application no does not exist' };

    const status = mapDpStatus(req.dpVerStatusFlag);
    await this.apps.updateStatus(app.id, {
      status,
      reason: req.dpVerReason ?? undefined,
      rawEvent: req,
    });
    if (status === 'dp_failed') await this.notifier.notifyApplicationStatus(app.id, status);
    return { status: 'success' };
  }

  async handlePayStatus(req: AppPayStatusRequest): Promise<CallbackAck> {
    const app = await this.apps.findBySymbolAndApplicationNo(req.symbol, req.applicationNumber);
    if (!app) return { status: 'failed', reason: 'Application no does not exist' };

    const { status, failed } = mapUpiStatus(req.upiPaymentStatusFlag);
    await this.apps.updateStatus(app.id, {
      status,
      amountBlocked: req.upiAmtBlocked,
      reason: req.upiPayReason ?? undefined,
      rawEvent: req,
    });
    // notify on meaningful transitions: funds blocked (success), rejection, or release
    if (status === 'upi_blocked' || failed || status === 'released') {
      await this.notifier.notifyApplicationStatus(app.id, status);
    }
    return { status: 'success' };
  }
}
