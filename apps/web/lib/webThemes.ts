/**
 * The CSS themes investoyard.com still carries — and the ONLY values this site
 * will ever put in `data-template`.
 *
 * The admin's Site layout choice no longer means one of these. Since 2026-11-16
 * it names a partner-site design (apps/partner), which this site has no CSS
 * for — and the generic `html[data-template]` rules hide our own header and
 * footer for ANY value. Applying a stored choice here would therefore give a
 * partner on "sterling" a site with no chrome at all. So the host map and
 * `applyPresentation` only honour an id from this list, which tenant content
 * can no longer hold, and every partner renders our own layout here.
 *
 * The themes stay reachable with `?template=` for review, and are otherwise
 * dead CSS awaiting a decision on whether to delete them.
 */
export const WEB_THEMES: readonly string[] = ['meridian', 'onyx', 'cobalt'];
