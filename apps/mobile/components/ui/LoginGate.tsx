import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { ui } from '../../lib/theme';
import { useT } from '../i18n';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { LockIcon } from './icons';

/** Standard signed-out prompt — same gate behaviour as before, restyled. */
export function LoginGate({ body }: { body?: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: ui.canvas, justifyContent: 'center' }}>
      <EmptyState
        icon={<LockIcon size={30} color={ui.indigo} />}
        title={t('apply.loginRequired')}
        body={body}
        cta={<Button label={t('login.getOtp')} onPress={() => router.push('/login')} />}
      />
    </View>
  );
}
