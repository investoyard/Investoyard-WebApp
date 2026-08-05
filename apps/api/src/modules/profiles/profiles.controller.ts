import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto, UpdateProfileDto } from './profiles.dto';

/** Public (no auth): just the relationship option names + allow-multiple flags. */
@Controller('profiles')
export class ProfilesPublicController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('relationships')
  relationships() {
    return this.profiles.relationships();
  }
}

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  list(@Req() req: any) {
    return this.profiles.list(req.user.sub);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateProfileDto) {
    return this.profiles.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.profiles.remove(req.user.sub, id);
  }
}
