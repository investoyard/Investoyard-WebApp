import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum Relationship { self = 'self', spouse = 'spouse', child = 'child', parent = 'parent', sibling = 'sibling', other = 'other' }
export enum Depository { NSDL = 'NSDL', CDSL = 'CDSL' }

export class CreateProfileDto {
  @IsEnum(Relationship) relationship!: Relationship;
  @IsString() fullName!: string;
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/) pan!: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsEnum(Depository) depository!: Depository;
  @IsString() dpId!: string;
  @IsString() clientId!: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/) ifsc?: string;
  @IsOptional() @Matches(/^[\w.\-]+@[\w.\-]+$/) upiId?: string;
}
