import { Injectable } from '@nestjs/common';
import { BidResult, SubmissionJob, SubmissionStore } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';

/** Prisma-backed SubmissionStore used by the SubmissionProcessor. */
@Injectable()
export class PrismaSubmissionStore implements SubmissionStore {
  constructor(private prisma: PrismaService) {}

  async isAlreadySubmitted(idempotencyKey: string): Promise<boolean> {
    const app = await this.prisma.application.findUnique({ where: { idempotencyKey } });
    // "submitted" = anything past draft and not a clean failure (so retries don't double-bid)
    return !!app && !['draft', 'failed'].includes(app.status);
  }

  async saveResult(job: SubmissionJob, result: BidResult): Promise<void> {
    const status = result.ok ? 'mandate_pending' : 'failed';
    await this.prisma.$transaction([
      this.prisma.application.update({
        where: { id: job.applicationId },
        data: {
          memberCredentialId: job.memberCredentialId,
          rail: 'NSE_EIPO',
          applicationNumber: result.applicationNumber,
          bidReferenceNumber: result.bidIds?.[0],
          upiFlag: job.bid.upi ? 'Y' : 'N',
          status: status as any,
        },
      }),
      this.prisma.applicationStatusEvent.create({
        data: { applicationId: job.applicationId, status: status as any, detail: result.raw as any },
      }),
    ]);
  }

  async markFailed(job: SubmissionJob, error: { code?: string; message: string }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.application.update({ where: { id: job.applicationId }, data: { status: 'failed' } }),
      this.prisma.applicationStatusEvent.create({
        data: { applicationId: job.applicationId, status: 'failed', detail: error as any },
      }),
    ]);
  }
}
