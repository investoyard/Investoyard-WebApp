/**
 * Home-feed IPO card — stage-driven layout (see lib/ipoStage.ts):
 *   Row 1  logo · Title-Case name · Mainboard/SME · reminder bell
 *          status chip (Open Today · Live · Closing Today · Awaiting Allotment
 *          · Allotment Out · Listed · Opens in Nd · Pre Apply)
 *   Row 2  MARKET BAND — GMP with expected gain (live) or the actual listing
 *          result (listed). The loudest element on the card, per the brief.
 *   Row 3  stat grid whose CONTENT CHANGES BY STAGE:
 *          before/during → Offer Price · Lot Size · Issue Size · Min Application
 *          after close    → Offer Price · Lot Size · Subscribed · Issue Size
 *   Row 4  stage note (+ progress to close while live)
 *   Row 5  panel chips relevant to THIS stage → one animated panel
 *   Row 6  the one action this stage calls for (Apply / Pre Apply / Remind Me /
 *          Check Allotment / IPO Performance)
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, animateNext, microLabel, ui } from '../lib/theme';
import { listingInfo, type IpoFull } from '../lib/ipoCalc';
import { demandWord, gmpGainPct, stageOf, PANEL_LABEL, type PanelKey } from '../lib/ipoStage';
import { fmtDate, inr, priceBand, titleCase } from '../lib/format';
import { tapSelect } from '../lib/haptics';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { CompanyLogo } from './ui/CompanyLogo';
import { GmpPanel, LotPanel, ReservationPanel, SubscriptionPanel, TimelinePanel } from './IpoPanels';
import { RemindBell } from './RemindBell';

export function IpoListCard({ ipo }: { ipo: IpoFull }) {
  const router = useRouter();
  const [open, setOpen] = useState<PanelKey | null>(null);

  const st = stageOf(ipo);
  const postClose = st.stage === 'awaiting' || st.stage === 'allotmentout' || st.stage === 'listed';
  const li = listingInfo(ipo);
  const subX = ipo.subscriptionTimes;
  const gainPct = gmpGainPct(ipo);

  const toggle = (k: PanelKey) => {
    tapSelect();
    animateNext();
    setOpen((cur) => (cur === k ? null : k)); // single-open accordion
  };

  const onCta = () => {
    tapSelect();
    switch (st.cta.kind) {
      case 'apply':
      case 'preapply': return router.push(`/apply/${ipo.symbol}`);
      case 'allotment': return router.push(`/insights?ipo=${encodeURIComponent(ipo.symbol)}`);
      case 'performance': return router.push('/performance');
      default: return router.push(`/ipo/${ipo.symbol}`);
    }
  };

  return (
    <Card style={styles.card} onPress={() => router.push(`/ipo/${ipo.symbol}`)}>
      {/* ── identity ── */}
      <View style={styles.top}>
        <CompanyLogo uri={ipo.logoUrl} name={ipo.name} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{titleCase(ipo.name)}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.boardTag, ipo.type === 'sme' && styles.boardTagSme]}>
              <Text style={[styles.boardTagTxt, ipo.type === 'sme' && styles.boardTagTxtSme]}>
                {ipo.type === 'sme' ? 'SME' : 'Mainboard'}
              </Text>
            </View>
            <Text style={styles.symbol} numberOfLines={1}>{ipo.symbol}</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          <View style={styles.chipRow}>
            {st.pulse ? <View style={[styles.pulse, { backgroundColor: st.tone === 'danger' ? ui.red : st.tone === 'gold' ? '#B8860B' : ui.green }]} /> : null}
            <Chip label={st.label} tone={st.tone} dot={!st.pulse} />
          </View>
          {st.stage !== 'listed' ? <RemindBell ipoId={(ipo as any).id} size={14} /> : null}
        </View>
      </View>

      {/* ── MARKET BAND: the number investors open the app for ── */}
      {li ? (
        <View style={[styles.market, { backgroundColor: (li.gainPct ?? 0) >= 0 ? ui.greenTint : ui.redTint }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.marketK, { color: (li.gainPct ?? 0) >= 0 ? ui.green : ui.red }]}>LISTING RESULT</Text>
            <Text style={styles.marketV}>
              {li.price ? `₹${li.price}` : '—'}
              {li.gainPct != null ? (
                <Text style={{ color: (li.gainPct ?? 0) >= 0 ? ui.green : ui.red }}>
                  {'   '}{(li.gainPct ?? 0) >= 0 ? '▲ +' : '▼ '}{li.gainPct}%
                </Text>
              ) : null}
            </Text>
          </View>
        </View>
      ) : ipo.gmp != null ? (
        <View style={[styles.market, { backgroundColor: ipo.gmp >= 0 ? ui.greenTint : ui.redTint }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.marketK, { color: ipo.gmp >= 0 ? ui.green : ui.red }]}>GREY MARKET PREMIUM</Text>
            <Text style={styles.marketV}>
              {ipo.gmp >= 0 ? '+' : '−'}₹{Math.abs(ipo.gmp)}
              {gainPct != null ? (
                <Text style={styles.marketGain}>
                  {'   '}{gainPct >= 0 ? '▲ +' : '▼ '}{Math.abs(gainPct)}% est. gain
                </Text>
              ) : null}
            </Text>
            <Text style={styles.marketNote}>Unofficial · not investment advice</Text>
          </View>
        </View>
      ) : null}

      {/* ── stat grid — contents follow the stage ── */}
      <View style={styles.stats}>
        <Stat k="Offer Price" v={priceBand(ipo.priceBandMin, ipo.priceBandMax)} />
        <View style={styles.statDiv} />
        <Stat k="Lot Size" v={ipo.lotSize != null ? `${ipo.lotSize}` : '—'} sub={ipo.lotSize != null ? 'shares' : undefined} />
      </View>
      <View style={styles.statsDivH} />
      <View style={styles.stats}>
        {postClose && subX != null ? (
          <Stat k="Subscribed" v={`${subX}×`} sub={demandWord(subX, ipo.type === 'sme')} hi />
        ) : (
          <Stat k="Min Application" v={inr(ipo.minAmount)} hi />
        )}
        <View style={styles.statDiv} />
        <Stat k="Issue Size" v={ipo.issueSize ?? '—'} />
      </View>

      {/* ── stage note (+ progress while the window is open) ── */}
      {st.stage === 'live' || st.stage === 'opentoday' || st.stage === 'closingtoday' ? (
        <LiveProgress ipo={ipo} note={st.note} urgent={st.stage === 'closingtoday'} />
      ) : st.note ? (
        <Text style={styles.note}>{st.note}</Text>
      ) : null}

      {/* live subscription bar while bidding is on */}
      {!postClose && subX != null && (st.stage === 'live' || st.stage === 'opentoday' || st.stage === 'closingtoday') ? (
        <View style={styles.subWrap}>
          <View style={styles.subTrack}>
            <View style={[styles.subFill, { width: `${Math.max(6, Math.min(100, (subX / 15) * 100))}%` }]} />
          </View>
          <Text style={styles.subTxt}>{demandWord(subX, ipo.type === 'sme')} · {subX}× subscribed</Text>
        </View>
      ) : null}

      {/* ── panels this stage makes relevant ── */}
      <View style={styles.topics}>
        {st.panels.map((key) => {
          const on = open === key;
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              style={({ pressed }) => [styles.topic, on && styles.topicOn, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
            >
              <Text style={[styles.topicTxt, on && styles.topicTxtOn]}>{PANEL_LABEL[key]}</Text>
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

      {/* ── the one action this stage calls for ── */}
      {st.cta.kind === 'remind' ? (
        <Button label={st.cta.label} variant="ghost" onPress={() => router.push(`/ipo/${ipo.symbol}`)} style={styles.cta} />
      ) : (
        <Button
          label={st.cta.label}
          variant={st.cta.kind === 'allotment' ? 'gold' : st.cta.kind === 'performance' ? 'ghost' : 'primary'}
          onPress={onCta}
          style={styles.cta}
        />
      )}
    </Card>
  );
}

/** Progress through the bidding window + the stage's own note. */
function LiveProgress({ ipo, note, urgent }: { ipo: IpoFull; note: string | null; urgent: boolean }) {
  if (!ipo.openDate || !ipo.closeDate) return note ? <Text style={styles.note}>{note}</Text> : null;
  const start = new Date(`${ipo.openDate}T00:00:00`).getTime();
  const end = new Date(`${ipo.closeDate}T23:59:59`).getTime();
  const pct = Math.min(1, Math.max(0.04, (Date.now() - start) / Math.max(1, end - start)));
  return (
    <View style={styles.closeWrap}>
      <View style={styles.closeTrack}>
        <View style={[styles.closeFill, { width: `${pct * 100}%` }, urgent && { backgroundColor: ui.red }]} />
      </View>
      <View style={styles.closeMeta}>
        <Text style={styles.dates}>{fmtDate(ipo.openDate).slice(0, 6)} – {fmtDate(ipo.closeDate).slice(0, 6)}</Text>
        {note ? <Text style={[styles.closesIn, urgent && { color: ui.red }]}>{note}</Text> : null}
      </View>
    </View>
  );
}

function Stat({ k, v, sub, hi }: { k: string; v: string; sub?: string; hi?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statK} numberOfLines={1}>{k}</Text>
      <Text style={[styles.statV, hi && { color: ui.indigo }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{v}</Text>
      {sub ? <Text style={styles.statSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  name: { fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.3, color: ui.title, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  boardTag: { backgroundColor: ui.slateTint, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5 },
  boardTagSme: { backgroundColor: ui.indigoTint },
  boardTagTxt: { fontSize: 9.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.slate, letterSpacing: 0.4 },
  boardTagTxtSme: { color: ui.indigo },
  symbol: { fontSize: 11.5, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, letterSpacing: 0.3 },
  topRight: { alignItems: 'flex-end', gap: 7 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pulse: { width: 7, height: 7, borderRadius: 4 },
  // market band — the loudest element on the card
  market: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 14 },
  marketK: { fontSize: 9.5, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: 0.7 },
  marketV: { fontSize: 22, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.5, color: ui.title, marginTop: 3, fontVariant: ['tabular-nums'] },
  marketGain: { fontSize: 13, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate },
  marketNote: { fontSize: 9.5, fontFamily: fonts.regular, color: ui.muted, marginTop: 3 },
  // stat grid
  stats: { flexDirection: 'row', marginTop: 14 },
  stat: { flex: 1, paddingRight: 10 },
  statK: { ...microLabel, fontSize: 9.5 },
  statV: { fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.3, color: ui.title, marginTop: 3, fontVariant: ['tabular-nums'] },
  statSub: { fontSize: 10, fontFamily: fonts.semibold, fontWeight: '600', color: ui.muted, marginTop: 1 },
  statDiv: { width: 1, backgroundColor: ui.divider, marginRight: 10 },
  statsDivH: { height: 1, backgroundColor: ui.divider, marginTop: 12 },
  note: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate, marginTop: 12 },
  closeWrap: { marginTop: 14 },
  closeTrack: { height: 4, borderRadius: 999, backgroundColor: ui.slateTint, overflow: 'hidden' },
  closeFill: { height: '100%', borderRadius: 999, backgroundColor: ui.indigo },
  closeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  closesIn: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo, fontVariant: ['tabular-nums'] },
  subWrap: { marginTop: 10 },
  subTrack: { height: 6, borderRadius: 999, backgroundColor: ui.slateTint, overflow: 'hidden' },
  subFill: { height: '100%', borderRadius: 999, backgroundColor: ui.indigo },
  subTxt: { fontSize: 12.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.indigo, marginTop: 5, fontVariant: ['tabular-nums'] },
  topics: { flexDirection: 'row', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  topic: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: ui.canvas },
  topicOn: { backgroundColor: ui.indigo },
  topicTxt: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate },
  topicTxtOn: { color: '#ffffff' },
  panel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider },
  dates: { fontSize: 12, color: ui.muted, fontFamily: fonts.semibold, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cta: { marginTop: 12 },
});
