import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

export class FormsPdfDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @IsString({ each: true }) ids!: string[];
}

export class BulkApplicantDto {
  @IsString() investorProfileId!: string;
  @IsInt() @Min(1) lots!: number;
  @IsOptional() @IsBoolean() atCutoff?: boolean;
  @IsOptional() bidPrice?: number;
  @IsOptional() @IsEnum(ApplicantCategory) applicantType?: ApplicantCategory;
}

/** Family / group apply — one rail addbulk call for up to 100 applicants. */
export class CreateBulkApplicationDto {
  @IsString() ipoId!: string;
  @IsString() category!: string;
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BulkApplicantDto)
  applicants!: BulkApplicantDto[];
  @IsIn(['native']) applyMethod!: 'native'; // bulk is a native-rail feature (pdf stays per-applicant)
  @IsOptional() @IsBoolean() dataSharingConsent?: boolean;
  @IsOptional() @IsString() consentNoticeVersion?: string;
}
