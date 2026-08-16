import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Partner Print-PDF contract: the partner sends FINAL, pre-computed data —
 * we print it verbatim (no lot/amount derivation or recalculation on our side).
 */
export class PartnerApplicantDto {
  @IsString() fullName!: string;
  @IsString() pan!: string;
  @IsIn(['NSDL', 'CDSL']) depository!: 'NSDL' | 'CDSL';
  @IsOptional() @IsString() dpId?: string;      // NSDL: IN + 6 digits · CDSL: blank
  @IsString() clientId!: string;                 // NSDL: 8 digits · CDSL: 16-digit demat
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

  /* bid — printed exactly as sent */
  @IsInt() @Min(1) lots!: number;
  @IsInt() @Min(1) shareQty!: number;
  @IsNumber() @Min(0) sharePrice!: number;
  @IsNumber() @Min(0) amount!: number;
  @IsIn(['Retail', 'sHNI', 'bHNI', 'Shareholder', 'Employee']) category!: string;
}

export class PartnerPrintFormsDto {
  @IsString() ipoSymbol!: string;
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PartnerApplicantDto)
  applicants!: PartnerApplicantDto[];
}

export class CreatePartnerKeyDto {
  @IsOptional() @IsString() label?: string;
}
