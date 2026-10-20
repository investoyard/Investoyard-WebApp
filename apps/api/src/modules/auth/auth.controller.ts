import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @Matches(/^\d{10}$/) mobile!: string;
}
class VerifyOtpDto {
  @IsString() requestId!: string;
  @Length(4, 8) otp!: string;
  /*
   * PRESENT ONLY ON SIGNUP. The same endpoint serves both doors: a known
   * mobile signs in and this is ignored, an unknown one needs it or the call
   * is refused with NO_ACCOUNT. One OTP pair rather than a second, duplicate
   * request/verify path that would drift from this one.
   */
  @IsOptional() @IsString() @Length(2, 60) name?: string;
}
/**
 * Password sign-in for a CUSTOMER. Separate from OperatorLoginDto because the
 * two identify people differently — an operator by username, a customer by
 * mobile — and sharing one DTO would make the mobile optional on both.
 */
class PasswordLoginDto {
  @Matches(/^\d{10}$/) mobile!: string;
  @IsString() @Length(1, 128) password!: string;
}
class SetPasswordDto {
  /* The rules themselves live in the service, so the message a person reads
     says what to fix rather than "password is too short". 128 is the outer
     bound only — scrypt will happily chew a megabyte otherwise. */
  @IsString() @Length(1, 128) password!: string;
}
class OtpChannelDto {
  @IsIn(['sms', 'whatsapp']) channel!: string;
}
class OperatorLoginDto {
  @IsString() @Length(2, 40) username!: string;
  @IsString() @Length(1, 200) password!: string;
}

/** Client IP for the auth audit trail (behind IIS/Cloudflare the proxy header wins). */
const clientIp = (req: any): string =>
  String(req?.headers?.['cf-connecting-ip'] ?? req?.headers?.['x-forwarded-for'] ?? req?.ip ?? '').split(',')[0].trim();

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  request(@Body() dto: RequestOtpDto, @Req() req: any) {
    return this.auth.requestOtp(dto.mobile, clientIp(req));
  }

  @Post('otp/verify')
  verify(@Body() dto: VerifyOtpDto, @Req() req: any) {
    return this.auth.verifyOtp(dto.requestId, dto.otp, clientIp(req), dto.name);
  }

  /**
   * Which doors this site can open. PUBLIC and unauthenticated — it describes
   * the site, never an account, so the login screen can offer only the methods
   * that actually deliver.
   */
  @Get('methods')
  methods() {
    return this.auth.authMethods();
  }

  /** Customer sign-in with mobile + password (opt-in; set from their profile). */
  @Post('password/login')
  passwordLogin(@Body() dto: PasswordLoginDto, @Req() req: any) {
    return this.auth.passwordLogin(dto.mobile, dto.password, clientIp(req));
  }

  /* ---- the customer’s own security settings ------------------------
   * All THREE require a live session, which can only have come from an OTP.
   * That is deliberate: it means the mobile is already proved, so setting a
   * password needs no separate verification step, and forgetting one needs no
   * reset flow at all — sign in with a code and set a new one.
   */
  @Get('security')
  @UseGuards(JwtAuthGuard)
  security(@Req() req: any) {
    return this.auth.securitySettings(req.user.sub);
  }

  @Post('security/password')
  @UseGuards(JwtAuthGuard)
  setPassword(@Body() dto: SetPasswordDto, @Req() req: any) {
    return this.auth.setPassword(req.user.sub, dto.password);
  }

  @Delete('security/password')
  @UseGuards(JwtAuthGuard)
  clearPassword(@Req() req: any) {
    return this.auth.clearPassword(req.user.sub);
  }

  @Post('security/otp-channel')
  @UseGuards(JwtAuthGuard)
  setOtpChannel(@Body() dto: OtpChannelDto, @Req() req: any) {
    return this.auth.setOtpChannel(req.user.sub, dto.channel);
  }

  /** Operator login (superadmin / partner / branch) — username + password. */
  @Post('operator/login')
  operatorLogin(@Body() dto: OperatorLoginDto, @Req() req: any) {
    return this.auth.operatorLogin(dto.username, dto.password, clientIp(req));
  }

  /** Current operator's identity + effective permissions (any logged-in user). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}
