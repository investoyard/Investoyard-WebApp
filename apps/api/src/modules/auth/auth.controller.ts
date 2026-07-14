import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @Matches(/^\d{10}$/) mobile!: string;
}
class VerifyOtpDto {
  @IsString() requestId!: string;
  @Length(4, 8) otp!: string;
}
class OperatorLoginDto {
  @IsString() @Length(2, 40) username!: string;
  @IsString() @Length(1, 200) password!: string;
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

  /** Operator login (superadmin / partner / branch) — username + password. */
  @Post('operator/login')
  operatorLogin(@Body() dto: OperatorLoginDto) {
    return this.auth.operatorLogin(dto.username, dto.password);
  }

  /** Current operator's identity + effective permissions (any logged-in user). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}
