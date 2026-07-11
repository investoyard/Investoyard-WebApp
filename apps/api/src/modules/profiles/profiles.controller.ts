import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './profiles.dto';

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

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.profiles.remove(req.user.sub, id);
  }
}
