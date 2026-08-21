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
import { fonts, animateNext, microLabel, ui } from '../lib/theme';
import { listingInfo, type IpoFull } from '../lib/ipoCalc';
import { fmtDate, inr, priceBand } from '../lib/format';
import { tapSelect } from '../lib/haptics';
import { useT } from './i18n';
import { Card } from './ui/Card';
import { Chip, ChipTone } from './ui/Chip';
import { Button } from './ui/Button';
import { CompanyLogo } from './ui/CompanyLogo';
import { GmpPanel, LotPanel, ReservationPanel, SubscriptionPanel, TimelinePanel } from './IpoPanels';
import { RemindBell } from './RemindBell';

type Topic = 'sub' | 'reservation' | 'lot' | 'timeline';

const STATUS_TONE: Record<string, ChipTone> = {
  open: 'success', upcoming: 'warn', closed: 'neutral', listed: 'neutral', withdrawn: 'danger',
};

function localDay(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysFromToday(date?: string): number | null {
  if (!date) return null;
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${localDay()}T00:00:00`).getTime()) / 86_400_000);
}

/**
 * ONE time-aware lifecycle tag per card (parity with web statusChip):
 * Opens in Nd · Pre Apply · Open Today · Live · Closing Today · Allotment out ·
 * light-purple Listed. "Pre Apply" = upcoming issue with Start Bid ON.
 */
export function cardTag(ipo: IpoFull, t: (k: string) => string): { label: string; tone: ChipTone } {
  const today = localDay();
  if (ipo.status === 'listed') return { label: 'Listed', tone: 'listed' };
  if (ipo.status === 'closed') {
    const ad = daysFromToday(ipo.allotmentDate);
    if (ad != null && ad <= 0) return { label: 'Allotment out', tone: 'gold' };
    return { label: t('status.closed'), tone: 'neutral' };
  }
  if (ipo.status === 'open') {
    if (ipo.closeDate === today) return { label: 'Closing Today', tone: 'danger' };
    if (ipo.openDate === today) return { label: 'Open Today', tone: 'success' };
    return { label: 'Live', tone: 'success' };
  }
  if (ipo.status === 'upcoming') {
    if ((ipo.extra as any)?.startBid === true) return { label: 'Pre Apply', tone: 'brand' };
    const od = daysFromToday(ipo.openDate);
    if (od === 1) return { label: 'Opens tomorrow', tone: 'warn' };
    if (od != null && od > 1 && od <= 4) return { label: `Opens in ${od}d`, tone: 'warn' };
    return { label: 'Upcoming', tone: 'warn' };
  }
  return { label: t(`status.${ipo.status}`), tone: STATUS_TONE[ipo.status] ?? 'neutral' };
}

/** Demand in plain words, calibrated per board (SME runs an order hotter). */
export function demandWord(subX: number, sme: boolean): string {
  const th = sme ? [1, 10, 50] : [1, 3, 10];
  if (subX < th[0]) return 'building up';
  if (subX < th[1]) return 'steady demand';
  if (subX < th[2]) return 'strong demand';
  return 'exceptional demand';
}

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
  // Apply shows only when the operator's "Start Bid" gate is ON for this issue.
  const canApply = (isOpen || ipo.status === 'upcoming') && (ipo.extra as any)?.startBid === true;
  const tag = cardTag(ipo, t);
  const subX = ipo.subscriptionTimes;
  const demandPct = subX != null ? Math.min(100, (subX / 15) * 100) : 0;

  const toggle = (k: Topic) => {
    tapSelect();
    animateNext();
    setOpen((cur) => (cur === k ? null : k)); // single-open accordion
  };

  const shortDate = (s?: string) => {
    const f = fmtDate(s);
    return f === '—' ? '—' : f.slice(0, 6); // "12 Aug"
  };

  return (
    <Card style={styles.card} onPress={() => router.push(`/ipo/${ipo.symbol}`)}>
      {/* Row 1 — identity (bigger logo + stronger name = the card's brand moment) */}
      <View style={styles.top}>
        <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{ipo.name}</Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {ipo.symbol} · {ipo.type === 'sme' ? 'SME' : 'Mainboard'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Chip label={tag.label} tone={tag.tone} />
          {ipo.status !== 'listed' ? <RemindBell ipoId={(ipo as any).id} size={14} /> : null}
        </View>
      </View>

      {/* Row 2 — ONE hero figure (min investment) + compact secondary strip */}
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroK}>Min investment</Text>
          <Text style={styles.heroV} numberOfLines={1} adjustsFontSizeToFit>{inr(ipo.minAmount)}</Text>
        </View>
        {ipo.lotSize != null ? (
          <View style={styles.lotBox}>
            <Text style={styles.lotBoxV}>{ipo.lotSize}</Text>
            <Text style={styles.lotBoxK}>shares / lot</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.secondary} numberOfLines={1}>
        Band {priceBand(ipo.priceBandMin, ipo.priceBandMax)}{ipo.issueSize ? `  ·  Issue ${ipo.issueSize}` : ''}
      </Text>

      {/* Row 3 — market signal + subscription progress. Listed issues swap the
          (now historical) GMP for the actual LISTING PRICE + gain; everything
          else on the card stays identical to a live issue. */}
      {(() => {
        const isListed = ipo.status === 'listed';
        const li = listingInfo(ipo);
        if (li) {
          const pos = (li.gainPct ?? 0) >= 0;
          return (
            <View style={styles.signals}>
              <View style={[styles.gmpChip, { backgroundColor: pos ? ui.greenTint : ui.redTint }]}>
                <Text style={[styles.gmpChipTxt, { color: pos ? ui.green : ui.red }]}>
                  {pos ? '▲' : '▼'} Listed{li.price ? ` at ₹${li.price}` : ''}{li.gainPct != null ? ` (${pos ? '+' : ''}${li.gainPct}%)` : ''}
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
                <Text style={styles.subTxt}>{demandWord(subX, ipo.type === 'sme')} · {subX}×</Text>
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

      {/* Row 4 — open issues get a progress-to-close bar; others keep the dates line */}
      {(() => {
        if (isOpen && ipo.openDate && ipo.closeDate) {
          const start = new Date(`${ipo.openDate}T00:00:00`).getTime();
          const end = new Date(`${ipo.closeDate}T23:59:59`).getTime();
          const now = Date.now();
          const elapsed = Math.min(1, Math.max(0.04, (now - start) / Math.max(1, end - start)));
          const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
          const urgent = daysLeft <= 1;
          return (
            <View style={styles.closeWrap}>
              <View style={styles.closeTrack}>
                <View style={[styles.closeFill, { width: `${elapsed * 100}%` }, urgent && { backgroundColor: ui.amber }]} />
              </View>
              <View style={styles.closeMeta}>
                <Text style={styles.dates}>Opened {shortDate(ipo.openDate)}</Text>
                <Text style={[styles.closesIn, urgent && { color: ui.amber }]}>
                  {daysLeft === 0 ? 'Closes today' : `Closes in ${daysLeft}d`}
                </Text>
              </View>
            </View>
          );
        }
        return (
          <Text style={[styles.dates, { marginTop: 14 }]}>
            Opens {shortDate(ipo.openDate)} · Closes {shortDate(ipo.closeDate)}
          </Text>
        );
      })()}
      {canApply ? (
        <Button label="Apply now" onPress={() => router.push(`/apply/${ipo.symbol}`)} style={styles.cta} />
      ) : (
        <Button label="View details" variant="ghost" onPress={() => router.push(`/ipo/${ipo.symbol}`)} style={styles.cta} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  name: { fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.3, color: ui.title, lineHeight: 21 },
  metaLine: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 3, letterSpacing: 0.2 },
  // money is the hero — one big figure per card
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  heroK: { ...microLabel, fontSize: 10.5 },
  heroV: { fontSize: 22, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.4, color: ui.title, marginTop: 3, fontVariant: ['tabular-nums'] },
  lotBox: {
    alignItems: 'center', backgroundColor: ui.canvas, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 84,
  },
  lotBoxV: { fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  lotBoxK: { fontSize: 10, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 1 },
  secondary: { fontSize: 12.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, marginTop: 8, fontVariant: ['tabular-nums'] },
  closeWrap: { marginTop: 14 },
  closeTrack: { height: 4, borderRadius: 999, backgroundColor: ui.slateTint, overflow: 'hidden' },
  closeFill: { height: '100%', borderRadius: 999, backgroundColor: ui.indigo },
  closeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  closesIn: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo, fontVariant: ['tabular-nums'] },
  signals: { marginTop: 12, gap: 8 },
  gmpBlock: { gap: 4 },
  gmpChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  gmpChipTxt: { fontSize: 11.5, fontFamily: fonts.bold, fontWeight: '700', fontVariant: ['tabular-nums'] },
  gmpNote: { fontFamily: fonts.regular, fontSize: 10, color: ui.muted },
  subWrap: { marginTop: 2 },
  subTrack: { height: 6, borderRadius: 999, backgroundColor: ui.slateTint, overflow: 'hidden' },
  subFill: { height: '100%', borderRadius: 999, backgroundColor: ui.indigo },
  subTxt: { fontSize: 13, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.indigo, marginTop: 5, fontVariant: ['tabular-nums'] },
  topics: { flexDirection: 'row', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  topic: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: ui.canvas,
  },
  topicOn: { backgroundColor: ui.indigo },
  topicTxt: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate },
  topicTxtOn: { color: '#ffffff' },
  panel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider },
  dates: { fontSize: 12, color: ui.muted, fontFamily: fonts.semibold, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cta: { marginTop: 10 },
});
