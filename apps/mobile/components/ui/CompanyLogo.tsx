import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fonts, ui } from '../../lib/theme';
import { initials } from '../../lib/format';

/**
 * Company logo box — white bg with a subtle #EEF0F5 ring, radius 12;
 * initials fallback = indigo on #EEEBFA (parity with the web IpoLogo).
 */
export function CompanyLogo({ uri, name, size = 44 }: { uri?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.27);
  if (uri && !failed) {
    return (
      <View style={[styles.ring, { width: size, height: size, borderRadius: radius }]}>
        <Image
          // Browser User-Agent: the logo host sits behind Cloudflare bot protection,
          // which rejects the native image loader's default UA (okhttp) → blank box.
          source={{ uri, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' } }}
          onError={() => setFailed(true)}
          style={{ width: size - 10, height: size - 10 }}
          resizeMode="contain"
        />
      </View>
    );
  }
  return (
    <View style={[styles.block, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.txt, { fontSize: Math.round(size * 0.34) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: ui.divider,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  block: {
    backgroundColor: ui.indigoTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: { fontFamily: fonts.extrabold, fontWeight: '800', color: ui.indigo, letterSpacing: 0.5 },
});
