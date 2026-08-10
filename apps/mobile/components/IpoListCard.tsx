/**
 * Home-feed IPO card — enterprise-fintech layout:
 *   Row 1  logo 44 · name + "SYMBOL · Board" · status pill
 *   Row 2  3-col mini stats (PRICE BAND / LOT SIZE / MIN INVEST)
 *   Row 3  GMP tinted chip (▲/▼) + not-advice footnote · subscription progress
 *   Row 4  dates line · full-width Apply (open) or ghost View details
 *   Topics 4 ghost chips (Subscription · Reservation · Lots · Timeline) →
 *          one LayoutAnimation panel, single-open.
 * Data parity with apps/web/components/IpoCard.tsx.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { animateNext, microLabel, ui } from '../lib/theme';
import type { IpoFull } from '../lib/ipoCalc';
import { fmtDate, inr, priceBand } from '../lib/format';
import { useT } from './i18n';
import { Card } from './ui/Card';
import { Chip, ChipTone } from './ui/Chip';
import { Button } from './ui/Button';
import { CompanyLogo } from './ui/CompanyLogo';
import { GmpPanel, LotPanel, ReservationPanel, SubscriptionPanel, TimelinePanel } from './IpoPanels';

type Topic = 'sub' | 'reservation' | 'lot' | 'timeline';

const STATUS_TONE: Record<string, ChipTone> = {
  open: 'success', upcoming: 'warn', closed: 'neutral', listed: 'neutral', withdrawn: 'danger',
};

const TOPICS: { key: Topic; label: string }[] = [
  { key: 'sub', label: 'Subscription' },
  { key: 'reservation', label: 'Reservation' },
  { key: 'lot', label: 'Lots' },
  { key: 'timeline', label: 'Timeline' },
];

export function IpoListCard({ ipo }: { ipo: IpoFull }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState<Topic | null>(null);

  const isOpen = ipo.status === 'open';
  const canApply = isOpen || ipo.status === 'upcoming';
  const subX = ipo.subscriptionTimes;
  const demandPct = subX != null ? Math.min(100, (subX / 15) * 100) : 0;

  const toggle = (k: Topic) => {
    animateNext();
    setOpen((cur) => (cur === k ? null : k)); // single-open accordion
  };

  const shortDate = (s?: string) => {
    const f = fmtDate(s);
    return f === '—' ? '—' : f.slice(0, 6); // "12 Aug"
  };

  return (
    <Card style={styles.card} onPress={() => router.push(`/ipo/${ipo.symbol}`)}>
      {/* Row 1 — identity */}
      <View style={styles.top}>
        <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{ipo.name}</Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}
          </Text>
        </View>
        <Chip label={t(`status.${ipo.status}`)} tone={STATUS_TONE[ipo.status] ?? 'neutral'} />
      </View>

      {/* Row 2 — 3-col mini stats */}
      <View style={styles.stats}>
        <MiniStat k="Price band" v={priceBand(ipo.priceBandMin, ipo.priceBandMax)} />
        <View style={styles.statDiv} />
        <MiniStat k="Lot size" v={ipo.lotSize != null ? String(ipo.lotSize) : '—'} />
        <View style={styles.statDiv} />
        <MiniStat k="Min invest" v={inr(ipo.minAmount)} />
      </View>

      {/* Row 3 — market signal + subscription progress. Listed issues swap the
          (now historical) GMP for the actual LISTING PRICE + gain; everything
          else on the card stays identical to a live issue. */}
      {(() => {
        const isListed = ipo.status === 'listed';
        const ex: any = (ipo as any).extra ?? {};
        const listedPrice =
          Number(String(ex.nseListingPrice || ex.bseListingPrice || '').replace(/[^\d.]/g, '')) ||
          (ipo.listingGainPct != null && ipo.priceBandMax ? Math.round(ipo.priceBandMax * (1 + ipo.listingGainPct / 100)) : 0);
        const gain = ipo.listingGainPct;
        if (isListed && (listedPrice || gain != null)) {
          const pos = (gain ?? 0) >= 0;
          return (
            <View style={styles.signals}>
              <View style={[styles.gmpChip, { backgroundColor: pos ? ui.greenTint : ui.redTint }]}>
                <Text style={[styles.gmpChipTxt, { color: pos ? ui.green : ui.red }]}>
                  {pos ? '▲' : '▼'} Listed{listedPrice ? ` at ₹${listedPrice}` : ''}{gain != null ? ` (${pos ? '+' : ''}${gain}%)` : ''}
                </Text>
              </View>
            </View>
          );
        }
        if (isListed || (ipo.gmp == null && subX == null)) return null;
        return (
          <View style={styles.signals}>
            {ipo.gmp != null ? (
              <View style={styles.gmpBlock}>
                <View style={[styles.gmpChip, { backgroundColor: ipo.gmp >= 0 ? ui.greenTint : ui.redTint }]}>
                  <Text style={[styles.gmpChipTxt, { color: ipo.gmp >= 0 ? ui.green : ui.red }]}>
                    {ipo.gmp >= 0 ? '▲' : '▼'} GMP {ipo.gmp >= 0 ? '+' : ''}₹{ipo.gmp}{ipo.gmpPct != null ? ` (${ipo.gmpPct}%)` : ''}
                  </Text>
                </View>
                <Text style={styles.gmpNote}>GMP is unofficial · not investment advice</Text>
              </View>
            ) : null}
            {isOpen && subX != null ? (
              <View style={styles.subWrap}>
                <View style={styles.subTrack}>
                  <View style={[styles.subFill, { width: `${Math.max(6, demandPct)}%` }]} />
                </View>
                <Text style={styles.subTxt}>{subX}× subscribed</Text>
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* Topic chips + single animated panel */}
      <View style={styles.topics}>
        {TOPICS.map(({ key, label }) => {
          const on = open === key;
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              style={({ pressed }) => [styles.topic, on && styles.topicOn, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
            >
              <Text style={[styles.topicTxt, on && styles.topicTxtOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {open ? (
        <View style={styles.panel}>
          {open === 'sub' ? <SubscriptionPanel ipo={ipo} /> : null}
          {open === 'reservation' ? <ReservationPanel ipo={ipo} /> : null}
          {open === 'lot' ? <LotPanel ipo={ipo} /> : null}
          {open === 'timeline' ? <TimelinePanel ipo={ipo} /> : null}
        </View>
      ) : null}

      {/* Row 4 — dates + CTA */}
      <Text style={styles.dates}>
        Opens {shortDate(ipo.openDate)} · Closes {shortDate(ipo.closeDate)}
      </Text>
      {canApply ? (
        <Button label="Apply now" onPress={() => router.push(`/apply/${ipo.symbol}`)} style={styles.cta} />
      ) : (
        <Button label="View details" variant="ghost" onPress={() => router.push(`/ipo/${ipo.symbol}`)} style={styles.cta} />
      )}
    </Card>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statK} numberOfLines={1}>{k}</Text>
      <Text style={styles.statV} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  name: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2, color: ui.title, lineHeight: 20 },
  metaLine: { fontSize: 12, fontWeight: '600', color: ui.muted, marginTop: 3, letterSpacing: 0.2 },
  stats: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14,
    backgroundColor: ui.canvas, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 6,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statDiv: { width: 1, height: 26, backgroundColor: ui.divider },
  // money is the hero — 16/800, shared baseline across the 3 columns
  statK: { ...microLabel, fontSize: 10.5, lineHeight: 13 },
  statV: { fontSize: 16, fontWeight: '800', color: ui.title, marginTop: 4, lineHeight: 20, fontVariant: ['tabular-nums'] },
  signals: { marginTop: 12, gap: 8 },
  gmpBlock: { gap: 4 },
  gmpChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  gmpChipTxt: { fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  gmpNote: { fontSize: 10, color: ui.muted },
  subWrap: { marginTop: 2 },
  subTrack: { height: 6, borderRadius: 999, backgroundColor: ui.slateTint, overflow: 'hidden' },
  subFill: { height: '100%', borderRadius: 999, backgroundColor: ui.indigo },
  subTxt: { fontSize: 13, fontWeight: '800', color: ui.indigo, marginTop: 5, fontVariant: ['tabular-nums'] },
  topics: { flexDirection: 'row', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  topic: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: ui.canvas,
  },
  topicOn: { backgroundColor: ui.indigo },
  topicTxt: { fontSize: 12, fontWeight: '700', color: ui.slate },
  topicTxtOn: { color: '#ffffff' },
  panel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider },
  dates: { fontSize: 12, color: ui.muted, fontWeight: '600', marginTop: 14, fontVariant: ['tabular-nums'] },
  cta: { marginTop: 10 },
});
