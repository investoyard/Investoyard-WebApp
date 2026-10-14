/**
 * Rich-HTML cleaning — now a RE-EXPORT.
 *
 * The implementation moved to `packages/shared-types/src/richText.ts` so it
 * could be tested: it is rendered with `dangerouslySetInnerHTML` on public
 * pages, which makes it a security boundary, and `apps/web` has no test runner.
 * This file stays so the existing callers (`IpoDetailView`, `admin/catalog/view`)
 * keep their import path.
 */
export { cleanRich, cleanRichKeepLinks } from '@investoyard/shared-types';
