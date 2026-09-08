import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post as HttpPost, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { tenantContext } from '../../common/tenant-context';

/**
 * News / blog posts — admin-written IPO coverage. Public reads serve only
 * published posts; drafts live in the admin. Slug auto-derives from the title
 * on create; publishedAt stamps on the first publish.
 */

class PostDto {
  @IsString() title!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() ipoSymbol?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsIn(['draft', 'published']) status?: string;
  @IsOptional() @IsString() author?: string;
}
class PostPatchDto extends PostDto {
  @IsOptional() @IsString() declare title: string;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';

const PUBLIC_SELECT = {
  slug: true, title: true, excerpt: true, coverUrl: true, ipoSymbol: true,
  tags: true, author: true, publishedAt: true,
} as const;

/** Public: published posts (list + read). */
@Controller('posts')
export class PostsPublicController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('ipo') ipo?: string, @Query('tag') tag?: string) {
    return tenantContext.runUnscoped(() =>
      this.prisma.post.findMany({
        where: {
          status: 'published',
          ...(ipo ? { ipoSymbol: { equals: ipo, mode: 'insensitive' } } : {}),
          ...(tag ? { tags: { has: tag } } : {}),
        },
        orderBy: { publishedAt: 'desc' },
        take: Math.min(Math.max(Number(limit) || 24, 1), 60),
        select: PUBLIC_SELECT,
      }),
    );
  }

  @Get(':slug')
  async read(@Param('slug') slug: string) {
    const post = await tenantContext.runUnscoped(() =>
      this.prisma.post.findFirst({
        where: { slug, status: 'published' },
        select: { ...PUBLIC_SELECT, body: true },
      }),
    );
    if (!post) throw new NotFoundException('Post not found.');
    return post;
  }
}

@Controller('admin/posts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PostsAdminController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermissions('ipos.view')
  list() {
    return tenantContext.runUnscoped(() =>
      this.prisma.post.findMany({ orderBy: { updatedAt: 'desc' } }),
    );
  }

  @HttpPost()
  @RequirePermissions('news.manage')
  async create(@Body() dto: PostDto) {
    if (!dto.title?.trim()) throw new BadRequestException('Title is required.');
    const slug = slugify(dto.slug?.trim() || dto.title);
    const status = dto.status ?? 'draft';
    try {
      return await tenantContext.runUnscoped(() =>
        this.prisma.post.create({
          data: {
            title: dto.title.trim(), slug,
            excerpt: dto.excerpt?.trim() || null,
            body: dto.body ?? '',
            coverUrl: dto.coverUrl || null,
            ipoSymbol: dto.ipoSymbol?.trim().toUpperCase() || null,
            tags: (dto.tags ?? []).map((t) => t.trim()).filter(Boolean),
            status, author: dto.author?.trim() || null,
            publishedAt: status === 'published' ? new Date() : null,
          },
        }),
      );
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('That slug already exists — change the slug.');
      throw e;
    }
  }

  @Patch(':id')
  @RequirePermissions('news.manage')
  async update(@Param('id') id: string, @Body() dto: PostPatchDto) {
    const found = await tenantContext.runUnscoped(() => this.prisma.post.findUnique({ where: { id } }));
    if (!found) throw new NotFoundException();
    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.slug !== undefined) data.slug = slugify(dto.slug);
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt?.trim() || null;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl || null;
    if (dto.ipoSymbol !== undefined) data.ipoSymbol = dto.ipoSymbol?.trim().toUpperCase() || null;
    if (dto.tags !== undefined) data.tags = (dto.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (dto.author !== undefined) data.author = dto.author?.trim() || null;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'published' && !found.publishedAt) data.publishedAt = new Date();
    }
    try {
      return await tenantContext.runUnscoped(() => this.prisma.post.update({ where: { id }, data }));
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('That slug already exists — change the slug.');
      throw e;
    }
  }

  @Delete(':id')
  @RequirePermissions('news.manage')
  async remove(@Param('id') id: string) {
    await tenantContext.runUnscoped(() => this.prisma.post.delete({ where: { id } }).catch(() => null));
    return { deleted: true };
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [PostsPublicController, PostsAdminController],
  providers: [PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class PostsModule {}
