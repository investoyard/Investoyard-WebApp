import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() upiId?: string;
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
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PartnerApplicantDto)
  applicants!: PartnerApplicantDto[];
}

export class CreatePartnerKeyDto {
  @IsOptional() @IsString() label?: string;
}
