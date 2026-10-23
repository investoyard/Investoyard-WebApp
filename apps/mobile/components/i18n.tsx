import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { fonts } from '../lib/theme';
import { Pressable, Text, StyleSheet } from 'react-native';
import { DEFAULT_LANG, Lang, LANGS, TRANSLATED_LANGS, makeT } from '@investoyard/i18n';
import { colors } from '@investoyard/design-tokens';

const LANG_KEY = 'iy_lang';

/* `TRANSLATED_LANGS` comes from `packages/i18n`, which is where the
   dictionaries are: the four scaffold languages hold `{}`, so choosing one
   changes nothing on screen. The first cut of this file PROBED `makeT` with
   a key and compared the answer against English — which would mark a
   language untranslated the moment one of its strings legitimately matched
   English. The package can simply look. */

/* `ready` is false until the stored choice has been read. NOTHING GATES ON IT
   TODAY and that is deliberate: a cold start paints in English for the
   milliseconds SecureStore takes, which for a Hindi reader is a flash of the
   wrong language — cosmetic, where holding the whole app back is not. It is
   exposed so a screen that does care can wait, rather than each one inventing
   its own way to find out. */
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string; ready: boolean };
const LanguageContext = createContext<Ctx>({ lang: DEFAULT_LANG, setLang: () => {}, t: (k) => k, ready: false });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  /* THE CHOICE IS KEPT. It used to be `useState(DEFAULT_LANG)` with a
     TODO(prod), so a reader who picked Hindi was back in English the next time
     they opened the app — and had no way to know the setting had not held.
     SecureStore rather than AsyncStorage because it is already a dependency
     (the session token lives in it) and a language preference does not justify
     adding a second storage library to the bundle. */
  useEffect(() => {
    SecureStore.getItemAsync(LANG_KEY)
      .then((v) => {
        /* A STORED CODE IS VALIDATED, never trusted. A language dropped from
           `LANGS` in a later release would otherwise strand whoever had chosen
           it on a code `makeT` cannot resolve, and every string would render as
           its own key. Falling back to English is recoverable; that is not. */
        if (v && LANGS.some((l) => l.code === v)) setLangState(v as Lang);
      })
      .catch(() => { /* a preference is not worth failing a cold start over */ })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      ready,
      t: makeT(lang),
      setLang: (l: Lang) => {
        setLangState(l);
        /* Fire and forget: the UI has already changed, and a write that fails
           costs the reader one re-pick rather than a blocked tap. */
        void SecureStore.setItemAsync(LANG_KEY, l).catch(() => {});
      },
    }),
    [lang, ready],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLang = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;

/** Header toggle — cycles through the languages that are actually translated. */
export function LangToggle() {
  const { lang, setLang } = useLang();
  const onPress = () => {
    /* Cycles TRANSLATED, not LANGS. Cycling all six walked a reader through
       four codes that change nothing on screen, which reads as a broken
       control rather than as a missing translation. */
    const list = TRANSLATED_LANGS.length ? TRANSLATED_LANGS : [DEFAULT_LANG];
    const idx = list.indexOf(lang);
    setLang(list[(idx + 1) % list.length]);
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
  toggleText: { color: colors.brand.primary, fontFamily: fonts.bold, fontWeight: '700', fontSize: 12.5 },
});
