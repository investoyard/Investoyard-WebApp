/**
 * The Moments hero — the design handoff's centrepiece.
 *
 * "A Moments home that reshapes itself around what the investor needs right
 * now", in five states: a quiet day that looks ahead, an open day, a closing
 * day, an allotment evening and a listing morning. WHICH one it is comes from
 * `momentPlan` in shared-types, which is pure and tested; this file only draws
 * the answer.
 *
 * U7 IS HERE TOO: when two Moments fall on one day the loser is never hidden,
 * it gets a compact action card directly under the hero. The engine already
 * prefers an ACTION for that slot, so a listing morning cannot bury a closing
 * deadline.
 *
 * U9: the hero carries "Updated N min ago" and a skeleton, because this is
 * where stale data costs the most.
 *
 * FOUR RULES FROM EARLIER IN THIS PASS ARE LOAD-BEARING HERE, and breaking any
 * of them reintroduces a fault this app has already paid for:
 *   - A GMP FIGURE IS GATED. The listing state shows a premium, so it sits
 *     inside `GmpReveal`; the flag used to dismiss a modal rather than unlock
 *     anything, and the home Moments are exactly where C1 said it leaked.
 *   - A PROJECTION IS NOT A REALISED GAIN (C2). The premium is set in the
 *     ink that carries no verdict, never the success colour, and keeps a sign.
 *   - NO LABEL SHRINK-WRAPS. Every button label takes its parent's width and
 *     centres, because a label sized to its own measurement cut the last
 *     letter off three board chips this morning.
 *   - NO INVENTED LISTING PRICE. The design's listing morning shows a live
 *     opening price against the issue price; we hold a listing price on ONE
 *     record of 1,148, and there is no live feed. So that state shows what we
 *     actually have and says the opening price is not in yet.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  LABEL,
  istClock,
  momentPlan,
  type ApplicationView,
  type MomentCandidate,
  type MomentIpo,
  type MomentKind,
  isLiveApplication,
  shortName,
} from '@investoyard/shared-types';
import { fonts, ui } from '../lib/theme';
import { inr, priceBand } from '../lib/format';
import type { IpoFull } from '../lib/ipoCalc';
import { GmpReveal } from './gmpConsent';
import { ChevronRightIcon, ClockIcon } from './ui/icons';

/** The eyebrow over the title — what today IS, in the vocabulary the app uses. */
const KIND_LABEL: Record<MomentKind, string> = {
  listing: 'Lists today',
  allotment: 'Allotment out',
  closing: 'Closing today',
  open: 'Open now',
  quiet: 'Next up',
};

/** The one action each state offers. Never more than one — the design's rule. */
const KIND_CTA: Record<MomentKind, string> = {
  listing: 'See performance',
  allotment: 'Check allotment',
  closing: 'Apply now',
  open: 'Apply now',
  quiet: 'View details',
};

type Tile = { k: string; v: string; sub?: boolean };

/** "3h 12m", "12m", "now" — a countdown that never shows a negative. */
function leftOf(at: number | null, now: number): string | null {
  if (at == null) return null;
  const ms = at - now;
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d left`;
  return `${h}h ${mins % 60}m left`;
}

/** "Updated 4 min ago" — U9. Null rather than a guess when nothing is stored. */
function freshness(iso: string | undefined, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `Updated ${h}h ago` : 'Updated earlier';
}

export function MomentHero({
  ipos,
  applications,
  memberCount,
}: {
  ipos: IpoFull[] | null;
  applications: ApplicationView[];
  memberCount: number;
}) {
  const router = useRouter();
  /* A minute's resolution is all a countdown here needs, and a 30s tick keeps
     it honest without spinning. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const live = useMemo(
    () => applications.filter((a) => isLiveApplication(a.status)),
    [applications],
  );

  const plan = useMemo(() => {
    if (!ipos) return null;
    const appliedSymbols = ipos
      .filter((i) => live.some((a) => a.ipoId === (i as any).id))
      .map((i) => i.symbol);
    return momentPlan(ipos as MomentIpo[], appliedSymbols, now);
    // `now` ticks every 30s; the plan is cheap and a stale stage is worse.
  }, [ipos, live, now]);

  if (!ipos || !plan) return <HeroSkeleton />;

  const byId = new Map(ipos.map((i) => [(i as any).id as string, i]));
  const bySymbol = new Map(ipos.map((i) => [i.symbol, i]));
  const ipo = plan.hero ? bySymbol.get(plan.hero.symbol) : plan.nextOpen ? bySymbol.get(plan.nextOpen.symbol) : undefined;
  if (!ipo) return null; // nothing to look forward to and nothing live

  const kind = plan.kind;
  const appsForIpo = live.filter((a) => a.ipoId === (ipo as any).id);
  const allotted = appsForIpo.filter((a) => a.status === 'allotted');
  const tiles = tilesFor(kind, ipo, appsForIpo.length, allotted.length, memberCount);
  const countdown = leftOf(plan.hero?.at ?? plan.nextOpenAt, now);
  const updated = freshness(ipo.subscriptionAsOf, now);

  /* THE CTA MUST NOT PROMISE WHAT THE OPERATOR HAS NOT OPENED. `/apply` renders
     "Bidding hasn't started yet" when `startBid` is off, and a button that
     lands there is worse than no button — the same rule the featured panel
     follows on web. */
  const canApply = (ipo.extra as any)?.startBid === true;
  const cta = (kind === 'closing' || kind === 'open') && !canApply ? 'View details' : KIND_CTA[kind];
  const onPress = () => {
    if ((kind === 'closing' || kind === 'open') && canApply) router.push(`/apply/${ipo.symbol}`);
    else if (kind === 'allotment') router.push('/insights');
    else if (kind === 'listing') router.push('/performance');
    else router.push(`/ipo/${ipo.symbol}`);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="mh" x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor={ui.gradTop} />
              <Stop offset="1" stopColor={ui.gradBottom} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" rx="20" fill="url(#mh)" />
        </Svg>

        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowL}>
            <View style={[styles.dot, kind === 'quiet' && styles.dotQuiet]} />
            <Text style={styles.eyebrow}>{KIND_LABEL[kind]}</Text>
          </View>
          {countdown ? (
            <View style={styles.eyebrowL}>
              <ClockIcon size={12} color="rgba(255,255,255,0.75)" strokeWidth={2} />
              <Text style={styles.countdown}>{countdown}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {shortName(ipo.name) || ipo.symbol}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {priceBand(ipo.priceBandMin, ipo.priceBandMax)}
          {ipo.lotSize ? ` · ${ipo.lotSize} shares/lot` : ''}
        </Text>

        {tiles.length ? (
          <View style={styles.tiles}>
            {tiles.map((t) => (
              <View key={t.k} style={styles.tile}>
                {t.sub ? (
                  /* A PREMIUM IS A PROJECTION AND IS GATED (C1) AND NEUTRAL
                     (C2): no success colour, and a sign rather than a hue. */
                  <GmpReveal compact placeholder={<Text style={styles.tileV}>—</Text>}>
                    <Text style={styles.tileV}>{t.v}</Text>
                  </GmpReveal>
                ) : (
                  <Text style={styles.tileV}>{t.v}</Text>
                )}
                <Text style={styles.tileK} numberOfLines={1}>{t.k}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footRow}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${cta} — ${shortName(ipo.name) || ipo.symbol}`}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaTxt}>{cta}</Text>
          </Pressable>
          {updated ? <Text style={styles.updated}>{updated}</Text> : null}
        </View>
      </View>

      {/* U7 — the second Moment of the day, never hidden further down. */}
      {plan.also ? <AlsoCard c={plan.also} ipo={bySymbol.get(plan.also.symbol)} now={now} /> : null}
      {byId.size === 0 ? null : null}
    </View>
  );
}

/** Up to three tiles, chosen per state. Each one is a fact we hold. */
function tilesFor(
  kind: MomentKind,
  ipo: IpoFull,
  appCount: number,
  allottedCount: number,
  memberCount: number,
): Tile[] {
  const total = ipo.subscription?.find((r) => r.category === 'total');
  const times = total?.timesSubscribed;
  /* GMP IS A TOP-LEVEL FIELD, NOT AN `extra` KEY. Reading `extra.gmp` meant
     this tile could never render - caught because the preview drew a false
     "+Rs0" and the field turned out to be `ipo.gmp`, which enrich() maps from
     the API. `extra` carries gmpLog and gmpSourceId, which is what misled me. */
  const gmp = (ipo as any).gmp as number | undefined;
  const minAmt = ipo.lotSize && ipo.priceBandMax ? ipo.lotSize * ipo.priceBandMax : null;

  if (kind === 'closing' || kind === 'open') {
    return [
      memberCount > 0 ? { k: 'applied', v: `${appCount} of ${memberCount}` } : null,
      times != null ? { k: 'subscribed', v: `${times.toFixed(2)}×` } : null,
      minAmt ? { k: 'per application', v: inr(minAmt) } : null,
    ].filter(Boolean) as Tile[];
  }
  if (kind === 'allotment') {
    return [
      { k: 'applications', v: String(appCount) },
      { k: 'allotted', v: String(allottedCount) },
      times != null ? { k: 'subscribed', v: `${times.toFixed(2)}×` } : null,
    ].filter(Boolean) as Tile[];
  }
  if (kind === 'listing') {
    /* NO INVENTED OPENING PRICE. We hold one on a single record of 1,148 and
       there is no live feed, so this states the issue price and the premium
       and leaves the rest to the performance screen. */
    return [
      ipo.priceBandMax ? { k: 'issue price', v: inr(ipo.priceBandMax) } : null,
      gmp != null ? { k: LABEL.gmp.toLowerCase(), v: `${gmp > 0 ? '+' : ''}${inr(gmp)}`, sub: true } : null,
      { k: 'your applications', v: String(appCount) },
    ].filter(Boolean) as Tile[];
  }
  return [
    minAmt ? { k: 'per application', v: inr(minAmt) } : null,
    ipo.type ? { k: 'board', v: ipo.type === 'sme' ? 'SME' : 'Mainboard' } : null,
  ].filter(Boolean) as Tile[];
}

/**
 * U7's compact action card. It sits DIRECTLY under the hero rather than
 * further down the page, which is the whole point of the finding: a deadline
 * must not be buried under a result.
 */
function AlsoCard({ c, ipo, now }: { c: MomentCandidate; ipo?: IpoFull; now: number }) {
  const router = useRouter();
  const left = leftOf(c.at, now);
  return (
    <Pressable
      onPress={() => router.push(`/ipo/${c.symbol}`)}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[c.kind]} — ${ipo ? shortName(ipo.name) : c.symbol}`}
      style={({ pressed }) => [styles.also, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.alsoDot} />
      <Text style={styles.alsoTxt} numberOfLines={1}>
        <Text style={styles.alsoStrong}>{KIND_LABEL[c.kind]}</Text>
        {' · '}
        {ipo ? shortName(ipo.name) || c.symbol : c.symbol}
        {left ? ` · ${left}` : ''}
      </Text>
      <ChevronRightIcon size={15} color={ui.slate} strokeWidth={2} />
    </Pressable>
  );
}

/** U9's skeleton. Same height as the hero, so the page does not jump. */
function HeroSkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: ui.skeleton }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  /* minHeight, not height — A7: a raised font scale must grow the card rather
     than clip what is inside it. */
  hero: { minHeight: 196, borderRadius: 20, padding: 16, overflow: 'hidden', justifyContent: 'flex-start' },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrowL: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFCB32' },
  dotQuiet: { backgroundColor: 'rgba(255,255,255,0.5)' },
  eyebrow: {
    fontFamily: fonts.bold, fontWeight: '700', fontSize: 11.5, letterSpacing: 0.6,
    textTransform: 'uppercase', color: '#FFCB32',
  },
  countdown: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 11.5, color: 'rgba(255,255,255,0.78)' },

  title: { fontFamily: fonts.extrabold, fontWeight: '800', fontSize: 21, lineHeight: 27, color: '#FFFFFF', marginTop: 10 },
  sub: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 3 },

  tiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tile: {
    flex: 1, minHeight: 50, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.10)', justifyContent: 'center',
  },
  tileV: {
    fontFamily: fonts.bold, fontWeight: '700', fontSize: 15, color: '#FFFFFF',
    fontVariant: ['tabular-nums'], alignSelf: 'stretch',
  },
  tileK: {
    fontFamily: fonts.semibold, fontWeight: '600', fontSize: 11, marginTop: 2,
    color: 'rgba(255,255,255,0.65)', alignSelf: 'stretch',
  },

  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 },
  /* 44dp without a hitSlop: the button's own box clears it, and slop here
     would reach into the freshness line beside it. */
  cta: { minHeight: 44, minWidth: 136, borderRadius: 13, paddingHorizontal: 18, justifyContent: 'center', backgroundColor: '#FFCB32' },
  /* The label fills its button and centres — a label sized to its own
     measurement is what cut the last letter off three board chips. */
  ctaTxt: {
    fontFamily: fonts.bold, fontWeight: '700', fontSize: 14, color: '#221A4A',
    alignSelf: 'stretch', textAlign: 'center',
  },
  updated: { fontFamily: fonts.semibold, fontWeight: '600', fontSize: 11, color: 'rgba(255,255,255,0.6)', flexShrink: 1, textAlign: 'right' },

  also: {
    flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44,
    marginTop: 8, paddingHorizontal: 13, borderRadius: 14,
    backgroundColor: ui.card, borderWidth: 1, borderColor: ui.divider,
  },
  alsoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ui.red },
  alsoTxt: { flex: 1, fontFamily: fonts.semibold, fontWeight: '600', fontSize: 12.5, color: ui.body },
  alsoStrong: { fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
});
