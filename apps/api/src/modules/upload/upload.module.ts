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
import { RequirePermissions, RequireAnyPermission } from '../../common/require-permissions.decorator';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
/* .ico is here ONLY for partner favicons -- browsers have accepted PNG and
   SVG icons for years, but a broker who already owns a .ico should not be
   told to go and convert it. Express sets the content type from the
   extension on the way out, so nothing else needs to know. */
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico']);
const ALLOWED_DOCS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']); // KYC/empanelment docs
/* The SERVING guard, and it is a separate list on purpose: a file that can be
   uploaded but not served is a silent 400 long after the upload "worked".
   Both lists move together. */
const SAFE_NAME = /^[a-f0-9-]{8,}\.(png|jpe?g|webp|svg|ico|pdf)$/i;

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Image uploads. Files are stored on the API's disk and served back from
 * /api/uploads/<file>; SERVING is public, uploading is not.
 *
 * THREE UPLOAD ROUTES, AND THE SPLIT IS BY WHAT THE PERMISSION MEANS rather
 * than by what the file is:
 *   /admin/upload        ipos.manage        — our own IPO catalogue artwork
 *   /admin/upload/brand  tenant.site.manage — a white-label's own brand assets
 *   /admin/upload/doc    either of the two  — KYC docs and IPO documents
 * A partner holds only the middle one, which is the whole point: the panel
 * that offers them an Upload button used to call the first and 403.
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

  /**
   * POST /api/admin/upload/brand — a white-label's OWN logo, footer logo or
   * favicon. Multipart 'file'. Returns an absolute URL to the stored image.
   *
   * A ROUTE OF ITS OWN RATHER THAN A LOOSENED `/admin/upload`, and the reason
   * is what each permission MEANS. `ipos.manage` is a platform grant over OUR
   * IPO catalogue; a white-label partner has no business holding it and does
   * not. So the branding panel rendered three Upload buttons that returned 403
   * for the only people the panel exists for — measured, not inferred: of the
   * seven tenant Admin roles, the two white-labels hold `tenant.site.manage`
   * and NOT `ipos.manage`, and `PermissionsGuard` is a plain `includes` with
   * no superadmin bypass.
   *
   * Widening `/admin/upload` to accept either would have been one line and
   * would have handed a partner an endpoint whose whole purpose is our own
   * catalogue surface. Splitting it gives them exactly the capability the
   * panel offers and nothing adjacent to it.
   *
   * SAME STORE, SAME LIMITS, SAME FILTER. The file lands in the one upload
   * directory and is served by the same public GET, so nothing downstream
   * learns a second path — and `.ico` is in ALLOWED for this route's sake,
   * since a broker who already owns one should not be told to convert it.
   */
  @Post('admin/upload/brand')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.site.manage')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB, as /admin/upload
    fileFilter: (_req: any, file: any, cb: any) =>
      ALLOWED.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new BadRequestException('Only PNG, JPG, WEBP, SVG or ICO images are allowed.'), false),
  }))
  uploadBrand(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = process.env.UPLOADS_BASE_URL || `${proto}://${host}`;
    return { url: `${base}/api/uploads/${file.filename}`, filename: file.filename };
  }

  /** POST /api/admin/upload/doc — multipart 'file'. Accepts PDF/image KYC +
   *  empanelment documents (8 MB). Also used for IPO-form document rows
   *  (DRHP / RHP / Prospectus etc.), so it must accept EITHER `tenants.manage`
   *  (partner admin uploading KYC) OR `ipos.manage` (Staff attaching a DRHP
   *  to an IPO). Was `tenants.manage` alone until 2026-09-22 — Staff got
   *  "Missing permission: tenants.manage" on every DRHP upload, so AONESTEEL
   *  never got its DRHP saved (completeness stuck at "missing"). */
  @Post('admin/upload/doc')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireAnyPermission('tenants.manage', 'ipos.manage')
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
