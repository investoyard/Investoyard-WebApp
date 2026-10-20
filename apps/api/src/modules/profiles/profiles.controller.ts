import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ProfilesService } from './profiles.service';
import { AddDematDto, CreateProfileDto, UpdateProfileDto } from './profiles.dto';

/** Public (no auth): just the relationship option names + allow-multiple flags. */
@Controller('profiles')
export class ProfilesPublicController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('relationships')
  relationships() {
    return this.profiles.relationships();
  }

  /* ---- bank / branch / pincode directory (Phase 3) ------------------
   * PUBLIC, like the two above: a published directory, not anybody data.
   * The branch search is the one that matters — 1.7 lakh rows, so it is
   * bank-scoped and capped server-side, never a full list.
   */
  @Get('banks')
  banks() {
    return this.profiles.banks();
  }

  @Get('bank-branches')
  branches(@Query('bankId') bankId?: string, @Query('q') q?: string, @Query('take') take?: string) {
    return this.profiles.branches({ bankId, q, take: take ? Number(take) : undefined });
  }

  /* The pincode is a PATH segment, but a plain 6-digit one — nothing like the
     UUID-in-path shape Cloudflare intercepted under /prints/. */
  @Get('states')
  states() {
    return this.profiles.states();
  }

  /* City SUGGESTIONS, derived from the pincode directory — see the service note
     on why this is not a master of its own and why it does not constrain. */
  @Get('cities')
  cities(@Query('q') q?: string, @Query('state') state?: string, @Query('take') take?: string) {
    return this.profiles.cities({ q, state, take: take ? Number(take) : undefined });
  }

  @Get('pincode/:pin')
  pincode(@Param('pin') pin: string) {
    return this.profiles.pincode(pin);
  }
  /** Public: allowed UPI handles (after '@') — drives UPI-ID entry validation. */
  @Get('upi-handles')
  upiHandles() {
    return this.profiles.upiHandles();
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

  /*
   * ADDITIONAL demat accounts (2026-10-08). Both return the whole refreshed
   * profile, so the caller never has to merge a partial response into its own
   * copy and then wonder which is current.
   *
   * There is deliberately NO edit route. A submitted bid names its demat to the
   * exchange, so changing the identifiers under it would rewrite what a real
   * application did; a typo is fixed by retiring the row and adding the right
   * one, which leaves the history honest.
   *
   * Literal path segment, not a bare id under the profile — the UUID-in-path
   * shape got intercepted upstream once before (see the Partner API print-detail
   * note in CLAUDE.md).
   */
  @Post(':id/demat')
  addDemat(@Req() req: any, @Param('id') id: string, @Body() dto: AddDematDto) {
    return this.profiles.addDemat(req.user.sub, id, dto);
  }

  @Delete(':id/demat/:dematId')
  retireDemat(@Req() req: any, @Param('id') id: string, @Param('dematId') dematId: string) {
    return this.profiles.retireDemat(req.user.sub, id, dematId);
  }
}
