import { BadRequestException, Controller, Get, Module, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtModule } from '@nestjs/jwt';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const ALLOWED_DOCS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']); // KYC/empanelment docs
const SAFE_NAME = /^[a-f0-9-]{8,}\.(png|jpe?g|webp|svg|pdf)$/i;

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Image uploads (IPO / brand logos). Files are stored on the API's disk and served
 * back from /api/uploads/<file>. Upload requires ipos.manage; serving is public.
 */
@Controller()
export class UploadController {
  /** POST /api/admin/upload — multipart 'file'. Returns an absolute URL to the stored image. */
  @Post('admin/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: (_req: any, file: any, cb: any) =>
      ALLOWED.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new BadRequestException('Only PNG, JPG, WEBP or SVG images are allowed.'), false),
  }))
  upload(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = process.env.UPLOADS_BASE_URL || `${proto}://${host}`;
    return { url: `${base}/api/uploads/${file.filename}`, filename: file.filename };
  }

  /** POST /api/admin/upload/doc — multipart 'file'. Accepts PDF/image KYC + empanelment documents (8 MB). */
  @Post('admin/upload/doc')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenants.manage')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (_req: any, file: any, cb: any) =>
      ALLOWED_DOCS.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new BadRequestException('Only PDF, PNG, JPG or WEBP documents are allowed.'), false),
  }))
  uploadDoc(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = process.env.UPLOADS_BASE_URL || `${proto}://${host}`;
    return { url: `${base}/api/uploads/${file.filename}`, filename: file.filename, name: file.originalname };
  }

  /** POST /api/admin/upload/pdf — multipart 'file'. PDF only (8 MB), for IPO ASBA blank forms. Needs ipos.manage. */
  @Post('admin/upload/pdf')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) =>
      extname(file.originalname).toLowerCase() === '.pdf'
        ? cb(null, true)
        : cb(new BadRequestException('Only PDF files are allowed.'), false),
  }))
  uploadPdf(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = process.env.UPLOADS_BASE_URL || `${proto}://${host}`;
    return { url: `${base}/api/uploads/${file.filename}`, filename: file.filename, name: file.originalname };
  }

  /** GET /api/uploads/:file — serve a stored image (public). */
  @Get('uploads/:file')
  serve(@Param('file') file: string, @Res() res: any) {
    if (!SAFE_NAME.test(file)) throw new BadRequestException('Invalid file.');
    return res.sendFile(join(UPLOAD_DIR, file));
  }
}

@Module({ imports: [JwtModule.register({})], controllers: [UploadController], providers: [JwtAuthGuard, PermissionsGuard, PrismaService] })
export class UploadModule {}
