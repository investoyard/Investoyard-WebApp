/**
 * IPO Glossary — same content source as the web page
 * (packages/shared-types/src/glossary.ts). Jump chips + expandable sections.
 */
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GLOSSARY } from '@investoyard/shared-types';
import { fonts, ui } from '../lib/theme';
import { tapLight } from '../lib/haptics';
import { Card } from '../components/ui/Card';

export default function GlossaryScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const secY = useRef<Record<string, number>>({});
  const [active, setActive] = useState(GLOSSARY[0].id);

  const jump = (id: string) => {
    tapLight();
    setActive(id);
    const y = secY.current[id];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.jumpWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumpRow}>
          {GLOSSARY.map((s) => {
            const on = active === s.id;
            return (
              <Pressable key={s.id} onPress={() => jump(s.id)} style={[styles.jumpChip, on && styles.jumpChipOn]}>
                <Text style={[styles.jumpTxt, on && styles.jumpTxtOn]}>{s.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {GLOSSARY.map((s) => (
          <View key={s.id} onLayout={(e) => { secY.current[s.id] = e.nativeEvent.layout.y; }}>
            <Text style={styles.secTitle}>{s.title}</Text>
            <Card style={{ paddingVertical: 4, marginBottom: 18 }}>
              {s.terms.map(([term, def], i) => (
                <View key={term} style={[styles.item, i < s.terms.length - 1 && styles.itemDiv]}>
                  <Text style={styles.term}>{term}</Text>
                  <Text style={styles.def}>{def}</Text>
                </View>
              ))}
            </Card>
          </View>
        ))}
        <Text style={styles.foot}>
          Educational content only — not investment advice. The offer documents and SEBI regulations are authoritative.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  jumpWrap: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: ui.divider, paddingVertical: 8 },
  jumpRow: { paddingHorizontal: 12, gap: 6 },
  jumpChip: { paddingHorizontal: 13, height: 32, borderRadius: 999, justifyContent: 'center', backgroundColor: ui.canvas },
  jumpChipOn: { backgroundColor: ui.indigo },
  jumpTxt: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  jumpTxtOn: { color: '#ffffff', fontFamily: fonts.bold, fontWeight: '700' },
  secTitle: { fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, letterSpacing: -0.2, marginBottom: 8 },
  item: { paddingVertical: 10 },
  itemDiv: { borderBottomWidth: 1, borderBottomColor: ui.divider },
  term: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo },
  def: { fontSize: 13.5, fontFamily: fonts.regular, color: ui.body, lineHeight: 20, marginTop: 3 },
  foot: { fontSize: 10.5, fontFamily: fonts.regular, color: ui.muted, textAlign: 'center', marginTop: 4 },
});
