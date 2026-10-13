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
  upiStatusLabel,
} from './rail-callback.dto';

/** What a status write may carry beyond the status itself. */
export interface StatusPatch {
  status: ApplicationStatus;
  amountBlocked?: number;
  reason?: string;
  /**
   * The exchange's own UPI sentence and when it was observed. Set on the UPI
   * path only — a DP callback says nothing about the payment, and writing a
   * timestamp there would date a sentence that had not changed.
   */
  upiStatusText?: string | null;
  upiStatusAt?: Date;
  rawEvent: unknown;
}

export interface ApplicationRepo {
  /** Find by exchange symbol + application number (the keys the rail sends). */
  findBySymbolAndApplicationNo(symbol: string, applicationNumber: string): Promise<{ id: string } | null>;
  updateStatus(id: string, patch: StatusPatch): Promise<void>;
}

export interface Notifier {
  /** push/in-app notification to the application owner */
  notifyApplicationStatus(applicationId: string, status: ApplicationStatus): Promise<void>;
}

/**
 * The two keys every callback is routed by.
 *
 * Without this check a body missing them reached
 * `findBySymbolAndApplicationNo(undefined, undefined)`, where Prisma threw on a
 * `symbol: undefined` lookup — so the exchange got a **500** where its own doc
 * (Ch.4) requires `{ status: "failed", reason }`. A 500 is also the one reply
 * that tells an exchange to retry, which is wrong for a body that can never
 * succeed.
 */
function badKeys(req: { symbol?: unknown; applicationNumber?: unknown }): CallbackAck | null {
  if (typeof req?.symbol !== 'string' || !req.symbol.trim()) {
    return { status: 'failed', reason: 'symbol is required' };
  }
  if (typeof req?.applicationNumber !== 'string' || !req.applicationNumber.trim()) {
    return { status: 'failed', reason: 'applicationNumber is required' };
  }
  return null;
}

export class RailCallbackService {
  constructor(
    private readonly apps: ApplicationRepo,
    private readonly notifier: Notifier,
  ) {}

  async handleDpStatus(req: AppDpStatusRequest): Promise<CallbackAck> {
    const keys = badKeys(req);
    if (keys) return keys;
    if (req.dpVerStatusFlag !== 'P' && req.dpVerStatusFlag !== 'S' && req.dpVerStatusFlag !== 'F') {
      /* A MISSING or unrecognised flag is not the same as an unrecognised UPI
         code: `mapDpStatus` defaults to `submitted`, so letting it through would
         write a status derived from nothing. Refuse instead. */
      return { status: 'failed', reason: 'dpVerStatusFlag must be P, S or F' };
    }

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
    const keys = badKeys(req);
    if (keys) return keys;
    if (!Number.isFinite(Number(req.upiPaymentStatusFlag)) || req.upiPaymentStatusFlag == null) {
      /* An unrecognised NUMBER stays pending on purpose — that is forward
         compatibility with a code the exchange adds later. A missing or
         non-numeric flag is different: `mapUpiStatus(NaN)` would also come back
         `mandate_pending`, so a malformed callback would quietly overwrite a
         real status with one derived from garbage. */
      return { status: 'failed', reason: 'upiPaymentStatusFlag must be a number' };
    }

    const app = await this.apps.findBySymbolAndApplicationNo(req.symbol, req.applicationNumber);
    if (!app) return { status: 'failed', reason: 'Application no does not exist' };

    const { status, failed } = mapUpiStatus(req.upiPaymentStatusFlag);
    await this.apps.updateStatus(app.id, {
      status,
      amountBlocked: req.upiAmtBlocked,
      reason: req.upiPayReason ?? undefined,
      // The sponsor bank's own free text when it sent one, else the exchange's
      // wording for the code. Its reason is the more specific of the two and is
      // what an investor needs when a block fails, so it wins.
      upiStatusText: req.upiPayReason?.trim() || upiStatusLabel(req.upiPaymentStatusFlag),
      upiStatusAt: new Date(),
      rawEvent: req,
    });
    // notify on meaningful transitions: funds blocked (success), rejection, or release
    if (status === 'upi_blocked' || failed || status === 'released') {
      await this.notifier.notifyApplicationStatus(app.id, status);
    }
    return { status: 'success' };
  }
}
