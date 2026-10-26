import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { GlobeIcon } from './icons';
import { useT } from '../i18n';
import { ui } from '../../lib/theme';

/**
 * "We could not reach the server" — the state that was MISSING, and whose
 * absence cost a log dig.
 *
 * `getIpos()` returns [] on a network error exactly as it does when the
 * catalogue is genuinely empty, so an unreachable API rendered as "there are
 * no IPOs today" with nothing on screen to say otherwise. On 2026-10-26 two
 * of three test devices showed an empty home screen and the only way to tell
 * which failure it was, was to read the IIS access log and find that their
 * requests had never arrived. A person holding the phone could not have known.
 *
 * This is the same distinction the WEB has drawn for months (a real empty
 * state vs. an API that is down) and which mobile never carried across — the
 * standing "when a rule is applied to one surface, grep the other" lesson.
 *
 * It is DELIBERATELY NOT an error dump. The reader can act on exactly one
 * thing (their connection) and retry; a status code or a stack would tell
 * them nothing they can use.
 */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  const t = useT();
  return (
    <EmptyState
      icon={<GlobeIcon size={30} color={ui.indigo} strokeWidth={1.8} />}
      title={t('offline.title')}
      body={t('offline.body')}
      cta={onRetry ? <Button label={t('offline.retry')} variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}
