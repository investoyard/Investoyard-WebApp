import { createContext, useContext, useMemo, useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { DEFAULT_LANG, Lang, LANGS, makeT } from '@investoyard/i18n';
import { colors } from '@investoyard/design-tokens';

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LanguageContext = createContext<Ctx>({ lang: DEFAULT_LANG, setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // TODO(prod): persist via AsyncStorage; default from device locale.
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const value = useMemo(() => ({ lang, setLang, t: makeT(lang) }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLang = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;

/** Header toggle — cycles en → hi → … through supported languages. */
export function LangToggle() {
  const { lang, setLang } = useLang();
  const onPress = () => {
    const idx = LANGS.findIndex((l) => l.code === lang);
    setLang(LANGS[(idx + 1) % LANGS.length].code);
  };
  const current = LANGS.find((l) => l.code === lang)!;
  return (
    <Pressable onPress={onPress} style={styles.toggle} accessibilityRole="button" accessibilityLabel="Change language">
      <Text style={styles.toggleText}>{current.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: '#EEEBFA', alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: colors.brand.primary, fontWeight: '700', fontSize: 12.5 },
});
