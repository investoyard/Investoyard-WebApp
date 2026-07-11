import { Body, Controller, Post } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @Matches(/^\d{10}$/) mobile!: string;
}
class VerifyOtpDto {
  @IsString() requestId!: string;
  @Length(4, 8) otp!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  request(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.mobile);
  }

  @Post('otp/verify')
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.requestId, dto.otp);
  }
}
