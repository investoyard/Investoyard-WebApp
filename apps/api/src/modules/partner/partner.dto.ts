import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Partner Print-PDF contract: the partner sends FINAL, pre-computed data —
 * printed VERBATIM. Printing is a form-filling service: NO business validation
 * (no PAN/demat format checks, no caps) — missing fields simply print blank.
 */
export class PartnerApplicantDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsIn(['NSDL', 'CDSL']) depository?: 'NSDL' | 'CDSL';
  @IsOptional() @IsString() dpId?: string;      // NSDL: IN + 6 digits · CDSL: blank
  @IsOptional() @IsString() clientId?: string;   // NSDL: 8 digits · CDSL: 16-digit demat
  @IsOptional() @IsString() bankAccount?: string;
  /**
   * IFSC and upiId used to be accepted here. Both were removed on
   * operator's decision — the printed ASBA form carries Bank Account,
   * Bank Name, and Branch Name; the ASBA block runs on the applicant's
   * own bank statement (no interbank routing means no IFSC) and UPI is
   * an electronic rail that doesn't appear on the physical form at all.
   * Requests that still include an `ifsc` or `upiId` field are silently
   * ignored (class-validator's whitelist strips unknown properties).
   * Backward compatible for any partner still integrated against the
   * old shape.
   */
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() branchName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  /** print grouping label — fills the form's FamilyGroup box */
  @IsOptional() @IsString() familyGroup?: string;

  /* bid — printed exactly as sent; anything omitted prints blank */
  @IsOptional() @IsInt() @Min(0) lots?: number;
  @IsOptional() @IsInt() @Min(0) shareQty?: number;
  @IsOptional() @IsNumber() @Min(0) sharePrice?: number;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsIn(['Retail', 'sHNI', 'bHNI', 'Shareholder', 'Employee']) category?: string;
}

export class PartnerPrintFormsDto {
  @IsString() ipoSymbol!: string;
  /**
   * ArrayMaxSize(500) is the PLATFORM hard ceiling — a defensive backstop so
   * a mistyped admin setting can never accept a runaway batch that would
   * exhaust memory or time out the request. The per-tenant cap
   * (Tenant.partnerMaxApplicantsPerCall, default 25) is enforced in the
   * service AFTER the DTO passes, where the tenant identity is known.
   * Both checks fire — DTO first, tenant cap second.
   */
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PartnerApplicantDto)
  applicants!: PartnerApplicantDto[];
}

export class CreatePartnerKeyDto {
  @IsOptional() @IsString() label?: string;
  /** The key's own scopes, a subset of its tenant's. Omitted or [] = everything the tenant has. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) scopes?: string[];
  /** live | test. A test key's bids go to the simulator. */
  @IsOptional() @IsIn(['live', 'test']) mode?: 'live' | 'test';
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) ipAllowlist?: string[];
}

export class UpdatePartnerKeyScopesDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) scopes!: string[];
}

/* ── Partner bid API (Phase 2) ───────────────────────────────────────────
   Every field is declared here even though the rules live in shared-types
   (`checkPartnerBid`): the global ValidationPipe runs with `whitelist`, so a
   field missing from these classes is silently stripped before the service
   ever sees it. The service, not class-validator, decides what is valid, so
   the partner gets every problem in one answer. */
export class PartnerBidDto {
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() consentRef?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() depository?: string;
  @IsOptional() @IsString() dpId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() upiId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() lots?: number;
  @IsOptional() @IsBoolean() atCutoff?: boolean;
  @IsOptional() @IsNumber() price?: number;
}

export class PartnerBidBatchDto {
  @IsString() ipoSymbol!: string;
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(25) @ValidateNested({ each: true }) @Type(() => PartnerBidDto)
  bids!: PartnerBidDto[];
}

export class PartnerBidRefDto {
  @IsOptional() @IsString() ref?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() consentRef?: string;
}

export class PartnerBidModifyDto extends PartnerBidRefDto {
  @IsNumber() lots!: number;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() atCutoff?: boolean;
}

export class PartnerBidUpiDto extends PartnerBidRefDto {
  @IsString() upiId!: string;
}

export class PartnerSimulateDto extends PartnerBidRefDto {
  @IsString() event!: string;
  @IsOptional() @IsNumber() allottedLots?: number;
}

export class PartnerWebhookDto {
  @IsString() url!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class PartnerKeyIpAllowlistDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) ipAllowlist!: string[];
}
