import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export enum IpoTypeDto { mainboard = 'mainboard', sme = 'sme' }
export enum IpoStatusDto { upcoming = 'upcoming', open = 'open', closed = 'closed', listed = 'listed', withdrawn = 'withdrawn' }

export class CreateIpoDto {
  @Matches(/^[A-Z0-9]{2,12}$/, { message: 'symbol must be 2–12 uppercase letters/digits' }) symbol!: string;
  @IsString() name!: string;
  @IsEnum(IpoTypeDto) type!: IpoTypeDto;
  @IsOptional() @IsEnum(IpoStatusDto) status?: IpoStatusDto;
  @IsOptional() @IsNumber() priceBandMin?: number;
  @IsOptional() @IsNumber() priceBandMax?: number;
  @IsOptional() @IsInt() @Min(1) lotSize?: number;
  @IsOptional() @IsNumber() minAmount?: number;
  @IsOptional() @IsNumber() issueSizeCr?: number;      // ₹ crore (converted to rupees)
  @IsOptional() @IsString() registrar?: string;
  @IsOptional() @IsString() openDate?: string;         // YYYY-MM-DD
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() @IsString() allotmentDate?: string;
  @IsOptional() @IsString() listingDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) reservations?: string[];
  @IsOptional() @IsNumber() gmp?: number;              // creates a GMP snapshot
  @IsOptional() @IsNumber() listingGainPct?: number;
}

/** All optional for PATCH (symbol immutable on update — omit it). */
export class UpdateIpoDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(IpoTypeDto) type?: IpoTypeDto;
  @IsOptional() @IsEnum(IpoStatusDto) status?: IpoStatusDto;
  @IsOptional() @IsNumber() priceBandMin?: number;
  @IsOptional() @IsNumber() priceBandMax?: number;
  @IsOptional() @IsInt() @Min(1) lotSize?: number;
  @IsOptional() @IsNumber() minAmount?: number;
  @IsOptional() @IsNumber() issueSizeCr?: number;
  @IsOptional() @IsString() registrar?: string;
  @IsOptional() @IsString() openDate?: string;
  @IsOptional() @IsString() closeDate?: string;
  @IsOptional() @IsString() allotmentDate?: string;
  @IsOptional() @IsString() listingDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) reservations?: string[];
  @IsOptional() @IsNumber() gmp?: number;
  @IsOptional() @IsNumber() listingGainPct?: number;
}
