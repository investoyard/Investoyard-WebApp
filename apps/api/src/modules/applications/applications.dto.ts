import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum ApplyMethod { native = 'native', pdf = 'pdf' }
export enum ApplicantCategory { individual = 'individual', shareholder = 'shareholder', employee = 'employee' }

export class CreateApplicationDto {
  @IsString() investorProfileId!: string;
  @IsString() ipoId!: string;
  @IsString() category!: string;
  @IsOptional() @IsEnum(ApplicantCategory) applicantType?: ApplicantCategory;
  @IsInt() @Min(1) lots!: number;
  @IsBoolean() atCutoff!: boolean;
  @IsOptional() bidPrice?: number;
  @IsEnum(ApplyMethod) applyMethod!: ApplyMethod;
  // DPDP data-sharing consent (gated in the service, so a missing/false value
  // returns a clear 403 rather than a generic validation error).
  @IsOptional() @IsBoolean() dataSharingConsent?: boolean;
  @IsOptional() @IsString() consentNoticeVersion?: string;
}

export class RecordAllotmentDto {
  @IsInt() @Min(0) allottedLots!: number;
}
