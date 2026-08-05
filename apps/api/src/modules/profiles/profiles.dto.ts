import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum Depository { NSDL = 'NSDL', CDSL = 'CDSL' }

export class CreateProfileDto {
  // Validated against the admin-managed RelationshipMaster in ProfilesService.
  @IsString() relationship!: string;
  @IsString() fullName!: string;
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/) pan!: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsEnum(Depository) depository!: Depository;
  // Depository-specific validation lives in ProfilesService (NSDL: IN+6 digits /
  // 8-digit client; CDSL: DP ID blank / 16-digit demat number).
  @IsOptional() @IsString() dpId?: string;
  @IsString() clientId!: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/) ifsc?: string;
  @IsOptional() @Matches(/^[\w.\-]+@[\w.\-]+$/) upiId?: string;
  // optional contact/bank fields used to prefill the ASBA form (not vaulted)
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() branchName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @Matches(/^\d{10}$/) mobile?: string;
}

/** Everything optional — omitted fields keep their current values. Secrets (PAN /
 *  bank / UPI) are replaced only when a non-empty value is sent. */
export class UpdateProfileDto {
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/) pan?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsEnum(Depository) depository?: Depository;
  @IsOptional() @IsString() dpId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/) ifsc?: string;
  @IsOptional() @Matches(/^[\w.\-]+@[\w.\-]+$/) upiId?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() branchName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @Matches(/^\d{10}$/) mobile?: string;
}
