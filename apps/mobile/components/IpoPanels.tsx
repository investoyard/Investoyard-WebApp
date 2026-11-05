/**
 * Shared IPO data panels — subscription table, reservation split, lot ladder,
 * timeline and GMP. Content parity with the web IpoCard/detail panels; styled
 * to the elevated fintech language (micro-labels, tinted fills, soft dividers).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, microLabel, shadowCard, ui } from '../lib/theme';
import * as calc from '../lib/ipoCalc';
import type { IpoFull } from '../lib/ipoCalc';
import { catColor, fmtDate, relText, segLabel, segTextColor, shC, timelineStates } from '../lib/format';
import { CheckIcon, ClockIcon } from './ui/icons';
import { GmpReveal } from './gmpConsent';
import { LABEL, anchorNote, appWiseRows, orderShareRows, shareWiseLabel, istTodayMs, subTone, subToneLabel, fmtCrore, qibSubRows } from '@investoyard/shared-types';

/* ── Live subscription by category ──────────────────────────────────────── */
/**
 * Share-wise rows with an Application-wise view behind a toggle (2026-10-09).
 *
 * A TOGGLE, not a second table: the phone row already carries a category, a
 * bar, a sub-line and a multiple, and web's own day-wise uses exactly this
 * control for the same choice — one vocabulary across the two surfaces.
 *
 * The toggle appears ONLY when the data is there. `appWiseRows` returns empty
 * unless a row carries both a bid count and a multiple, which is most of the
 * catalogue: the exchanges report bid counts for a minority of issues. Offering
 * an empty view would be worse than not offering one.
 *
 * Which categories the Application-wise view lists — and why QIB never does —
 * is `APP_WISE_ORDER` in shared-types/appWise.ts, read by this panel and by
 * both web surfaces so a category cannot be dropped from two of three.
 */
/* ── Subscription hero — the headline figure web's detail page leads with ──
 *
 * Web's `LiveSubscription` opens with a big times figure, a meter ticked
 * 0x/1x/2x/3x+, the tone word, and three tiles: Book · Subscribed ·
 * Applications. Mobile's detail page had NONE of it - it went straight to the
 * table - so the one number a reader opens the page for was only available by
 * reading a column.
 *
 * MOUNTED ON THE DETAIL PAGE ONLY, behind a prop, which is where web mounts
 * it: the hub card has its own lighter strip. Mobile's home list card renders
 * the same SubscriptionPanel inside a collapsible, and a 100px hero there
 * would push the table itself off the first screen.
 *
 * THREE SIGNAL COLOURS WHERE WEB HAS FOUR, deliberately. Web ramps
 * pos → gold-600 → warn → neg; mobile's palette carries green, amber and red
 * and adding a fourth for this one figure would be a fifth signal colour on a
 * surface whose palette is already the status legend's. So `warm` and `cool`
 * share amber and THE WORD carries the distinction - which is the A6 rule
 * anyway: a state a reader needs must not be carried by colour alone.
 *
 * The meter is the same 3x full-scale web uses, so a reader moving between the
 * two is comparing like with like.
 */
export function SubscriptionHero({ ipo }: { ipo: IpoFull }) {
  const t = calc.subscriptionTable(ipo);
  if (!t) return null;
  const times = t.total.times;
  const tn = subTone(times);
  /* 3x is full scale, matching web's meter, and the fill never disappears
     entirely: a 2% stub reads as "bidding has started" where 0 reads as
     broken. */
  const pct = Math.max(times > 0 ? 2 : 0, Math.min(100, (times / 3) * 100));
  const ink = tn === 'hot' ? ui.green : tn === 'cold' ? ui.red : ui.amber;
  const bookCr = (t.total.bookAmount ?? 0) / 1e7;
  const subCr = (t.total.subAmount ?? 0) / 1e7;
  /* `total.bidCount` - the SAME expression web's tile prints, so the two
     surfaces cannot disagree about how many applications there are. The old
     derivation (forms-for-1x times the SHARE-wise multiple) was deleted on
     2026-10-21 because it is not a count of applications at all. */
  const apps = t.total.bidCount ?? 0;

  return (
    <View style={s.heroWrap}>
      <View style={s.heroTop}>
        <Text style={[s.heroTimes, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {times.toFixed(2)}<Text style={s.heroTimesX}>×</Text>
        </Text>
        <Text style={[s.heroTone, { color: ink }]} numberOfLines={1}>{subToneLabel(times)}</Text>
      </View>

      <View style={s.heroTrack}>
        <View style={[s.heroFill, { width: `${pct}%`, backgroundColor: ink }]} />
      </View>
      <View style={s.heroTicks}>
        {['0×', '1×', '2×', '3×+'].map((k) => <Text key={k} style={s.heroTick}>{k}</Text>)}
      </View>

      <View style={s.heroTiles}>
        {([
          ['Book', bookCr > 0 ? fmtCrore(bookCr) : '—', ui.title],
          ['Subscribed', subCr > 0 ? fmtCrore(subCr) : '—', ink],
          ['Applications', apps > 0 ? shC(apps) : '—', ui.title],
        ] as const).map(([k, v, c]) => (
          <View key={k} style={s.heroTile}>
            <Text style={s.heroTileK} numberOfLines={1}>{k}</Text>
            <Text style={[s.heroTileV, { color: c }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function SubscriptionPanel({ ipo }: { ipo: IpoFull }) {
  const [view, setView] = useState<'shares' | 'apps' | 'money'>('shares');
  const t = calc.subscriptionTable(ipo);
  if (!t) return <Text style={s.muted}>Subscription not open yet.</Text>;

  const appRows = appWiseRows(t.rows);
  const hasApps = appRows.length > 0;
  /* Application-wise hides itself when the exchange reports no bid counts —
     most of the catalogue. Demand always has figures, because it is the same
     shares valued at a price we already hold, so it never needs hiding. */
  const shown = view === 'apps' && !hasApps ? 'shares' : view;
  /* Share-wise takes SHARE_ORDER; Application-wise is already ordered by
     `appWiseRows`, which returns APP_WISE_ORDER — a DIFFERENT list, since it
     leaves QIB out entirely (an institution bids with no minimum application
     size, so there is no applications-for-1x to divide by). Re-sorting that
     one would be a second opinion about a question already answered. */
  const rows = shown === 'apps' ? appRows : orderShareRows(t.rows);
  /* ₹ CRORE, SIZED TO THE COLUMN. The two decimals web prints reach
     "₹2,01,471.88" — ~102px at this weight, in an 82px slot. Decimals are
     kept while the issue is small enough to carry them and dropped once it
     is not: ₹3.50 and ₹2,01,472 are both the honest reading at their size.

     THE PRECISION IS CHOSEN ONCE, FROM THE WIDEST ROW, and applied to every
     figure including the total. Per-value it gave a column reading ₹453.8,
     ₹707.5, ₹538.6, ₹168.9, ₹1,062 — four with a decimal and one without,
     because only one crossed 1000. How many decimals an issue can carry is a
     property of the ISSUE, not of each of its categories. */
  const dpFor = (vals: (number | undefined)[]) => {
    const top = Math.max(0, ...vals.map((v) => (v ?? 0) / 1e7));
    return top >= 1000 ? 0 : top >= 100 ? 1 : 2;
  };
  /* ONE PRECISION PER COLUMN. Applied and book are orders of magnitude apart
     on an oversubscribed issue — SHELLZ applies ₹1,062 Cr against a ₹19 Cr
     book — so a precision chosen from the applied figures rounded its ₹2.71
     Cr QIB book to "₹3 Cr". Each column decides from its own widest value. */
  const dpSub = dpFor([...t.rows.map((r) => r.subAmount), t.total.subAmount]);
  const dpBook = dpFor([...t.rows.map((r) => r.bookAmount), t.total.bookAmount]);
  const money = (paise: number | undefined, dp: number) => {
    const v = paise != null && paise > 0 ? paise / 1e7 : 0;
    return '\u20b9' + v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  const totalApps = appRows.reduce((n, r) => n + (r.bidCount ?? 0), 0);
  /* The poller-owned key. Rides along on every record from `getIpos()`, so
     reading it costs no fetch. Valued at the QIB row's own price, which is the
     band price unless that quota carries a discount - the same per-row price
     `subscriptionTable` gives every other figure in this view. */
  const qibRow = t.rows.find((r) => r.key === 'qib');
  const qibPx = qibRow?.price && qibRow.price > 0 ? qibRow.price : 0;
  const qibSubs = shown === 'money' ? qibSubRows((ipo.extra as any)?.qibSplit) : [];

  return (
    <View>
      <View style={s.subSeg}>
        {/* `Application-wise` drops out when there is nothing behind it; the
            other two are always there, so the control is never a single
            lonely pill. Labels shrink rather than truncate — three segments
            on a 320px phone is the tight case, and a clipped "Application-"
            is worse than 11px type. */}
        {(hasApps
          ? ([['shares', 'Share-wise'], ['apps', 'Application-wise'], ['money', '₹ Crore']] as const)
          : ([['shares', 'Share-wise'], ['money', '₹ Crore']] as const)
        ).map(([k, label]) => (
          <Pressable
            hitSlop={{ top: 7, bottom: 7 }}
            key={k}
            onPress={() => setView(k)}
            style={({ pressed }) => [s.subSegBtn, shown === k && s.subSegBtnOn, pressed && { opacity: 0.8 }]}
          >
            <Text
              style={[s.subSegTxt, shown === k && s.subSegTxtOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {rows.map((r) => {
        /* The bar is the same 15× ramp in both views so a reader switching
           between them is comparing like with like. */
        /* A PRO-RATA ROW CARRIES NO APPLICATION-WISE RATIO (operator ask,
           2026-10-21). Employee / shareholder / policyholder are allotted
           proportionately, so there the SHARE-wise multiple decides an
           allotment and the application count decides nothing. JPL is the
           case: its employee quota is over-subscribed at 1.08x by shares
           while this view read 0.16x.

           The row keeps its COUNT, which is the one figure on it that means
           something, and loses the BAR along with the number — a bar at its
           4% floor would read as the 0x this exists to remove. Web prints NA
           in a Req 1x column; a phone row has no such column, so the
           sub-line stops claiming one and says why instead. Keep the two in
           step by hand, as with the split UPI input and DematPanel. */
        const noRatio = shown === 'apps' && r.proRata === true;
        /* The BAR is the same times ramp in all three views, and in Demand
           that is exact rather than approximate: both sides of the ratio
           scale by the same price, so the rupee multiple IS the share
           multiple. Recomputing it from the rupee figures could only add
           rounding drift between two views of one issue. */
        const times = shown === 'apps' ? (r.applicationsTimes ?? 0) : r.times;
        const under = !noRatio && times < 1;
        const w = Math.max(4, Math.min(100, (times / 15) * 100));
        return (
          <View style={s.subRow} key={r.cat}>
            {/* "QIB (Ex. Anchor)" where a deduction was taken, so the number
                explains itself where it is read; the plain label where none
                was, because there the book IS gross and the suffix would lie.
                Share-wise only — an Application-wise row counts applications,
                which the anchor has no bearing on. */}
            <Text style={s.subCat} numberOfLines={1}>
              {shown === 'apps' ? r.cat : shareWiseLabel(r, t.anchorDeducted)}
            </Text>
            <View style={s.subMid}>
              {!noRatio && (
                <View style={s.track}>
                  <View style={[s.fill, { width: `${w}%`, backgroundColor: catColor(r.cat) }]} />
                </View>
              )}
              <Text style={s.subBook}>
                {shown === 'money'
                  ? `book ${money(r.bookAmount, dpBook)} Cr`
                  : shown === 'apps'
                  /* Applications RECEIVED against those needed for 1× — the two
                     figures the Reserved column on an SME lot ladder does not
                     carry, which is why this view exists at all. */
                  ? (noRatio
                    ? `${shC(r.bidCount ?? 0)} applications · allotted pro-rata`
                    : `need ${shC(r.req1x ?? 0)} for 1× · got ${shC(r.bidCount ?? 0)}`)
                    : `book ${shC(r.bookSize)} · applied ${shC(r.subscribed)}`}
              </Text>
            </View>
            <Text style={[s.subX, shown === 'money' && s.subXMoney, shown !== 'money' && under && s.subUnder]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {shown === 'money'
                ? money(r.subAmount, dpSub)
                : noRatio ? '\u2014' : `${times}\u00d7`}
            </Text>
          </View>
        );
      })}

      {/* QIB's institutional split - INDENTED UNDER IT, never beside it. The
          exchange sends these sub-rows with no parent and their sum IS the qib
          figure above, so rendering them as peers would treble that quota, the
          same reason the two HNI bands sit under NII. */}
      {qibSubs.map(([label, sh]) => (
        <View style={[s.subRow, s.qibSub]} key={label}>
          <Text style={[s.subCat, s.qibSubCat]} numberOfLines={1}>{label}</Text>
          <View style={s.subMid}>
            <Text style={s.subBook}>{shC(sh)} sh</Text>
          </View>
          <Text style={[s.subX, s.subXMoney, s.qibSubX]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {money(qibPx > 0 ? sh * qibPx : 0, dpSub)}
          </Text>
        </View>
      ))}

      <View style={s.subTotal}>
        <Text style={s.subTotalK}>
          {shown === 'apps' ? 'Total applications'
            : shown === 'money' ? 'Total applied (₹ Cr)'
            : 'Total subscription'}
        </Text>
        <Text style={s.subTotalV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {shown === 'apps' ? shC(totalApps)
            : shown === 'money'
              /* The TOTAL's rupees are summed in `subscriptionTable`, where each
                 row's own price is known — never recomputed here from a weighted
                 average, which is off by the employee discount. */
              ? money(t.total.subAmount, dpSub)
              : `${t.total.times}×`}
        </Text>
      </View>

      {/* ONE OF THREE SENTENCES, never a generic "Net" — a deduction taken
          from a stated share count is the allotment off the intimation
          letter and can be checked against the exchange, while one taken
          from `anchorPct` is our arithmetic against a ceiling the issue may
          not have used. `shC` rather than the full grouping: a phone reads
          "0.49 Cr" where web has a footnote line for "48,83,605". */}
      {shown === 'shares' ? (
        <Text style={s.anchorNote}>{anchorNote(t.anchorDeducted, t.anchorBasis, shC)}</Text>
      ) : null}
    </View>
  );
}

/* ── Issue reservation (stacked bar + legend) ───────────────────────────── */
export function ReservationPanel({ ipo }: { ipo: IpoFull }) {
  const rows = calc.reservation(ipo);
  if (!rows.length) return <Text style={s.muted}>Category-wise reservation not announced yet.</Text>;
  return (
    <View>
      <View style={s.alloc}>
        {rows.map((r) => (
          <View key={r.cat} style={[s.allocSeg, { flex: Math.max(0.001, r.pct), backgroundColor: catColor(r.cat) }]}>
            <Text style={[s.allocTxt, { color: segTextColor(r.cat) }]} numberOfLines={1}>{segLabel(r.cat, r.pct)}</Text>
          </View>
        ))}
      </View>
      {rows.map((r) => (
        <View style={s.legRow} key={r.cat}>
          <View style={[s.swatch, { backgroundColor: catColor(r.cat) }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.legWho}>{r.cat}</Text>
            <Text style={s.legNum}>{shC(r.shares)} sh · {calc.crOrInr(r.amount)}</Text>
          </View>
          <Text style={s.legPct}>{r.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

/* ── Lot ladder by category ─────────────────────────────────────────────── */
export function LotPanel({ ipo }: { ipo: IpoFull }) {
  const rows = calc.lotLadder(ipo);
  if (!rows.length) return <Text style={s.muted}>Lot size not available.</Text>;
  /* RESERVED - applications needed for 1x - and SME ONLY, which is where web
     carries it. Web's mainboard ladder has no such column, and adding one here
     would be a difference FROM web rather than parity with it.

     Mapped exactly as web maps it, off the same `subscriptionTable`:
     Individual -> retail, sHNI -> hni2, bHNI -> hni. `req1x` is undefined on a
     pro-rata row by design, so `?? 0` is the same fallback web uses. */
  const isSme = ipo.type === 'sme';
  const subTable = isSme ? calc.subscriptionTable(ipo) : null;
  const reqFor = (cat: string) => {
    const key = cat === 'Individual' ? 'retail' : cat === 'sHNI' ? 'hni2' : cat === 'bHNI' ? 'hni' : null;
    if (!key || !subTable) return 0;
    return subTable.rows.find((r) => r.key === key)?.req1x ?? 0;
  };
  const groups: { cat: string; sub: string; min: calc.LotRow; max: calc.LotRow }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.cat === r.cat);
    if (!g) groups.push({ cat: r.cat, sub: r.sub, min: r, max: r });
    else { if (r.lots < g.min.lots) g.min = r; if (r.lots > g.max.lots) g.max = r; }
  }
  return (
    <View style={{ gap: 8 }}>
      {groups.map((g) => {
        const single = g.min.lots === g.max.lots;
        return (
          <View key={g.cat} style={[s.lotCard, { borderLeftColor: catColor(g.cat) }]}>
            <View style={s.lotHead}>
              <Text style={s.lotWho}>{g.cat} <Text style={s.lotBand}>· {g.sub}</Text></Text>
              <Text style={s.lotTag}>{single ? `${g.min.lots}+ lots` : `${g.min.lots}–${g.max.lots} lots`}</Text>
            </View>
            <View style={s.lotGrid}>
              <View style={s.lotCell}>
                <Text style={s.lotK}>MIN · {g.min.lots} {g.min.lots > 1 ? 'LOTS' : 'LOT'}</Text>
                <Text style={s.lotV}>{g.min.shares.toLocaleString('en-IN')} <Text style={s.lotSm}>sh · {calc.crOrInr(g.min.amount)}</Text></Text>
              </View>
              {single && reqFor(g.cat) > 0 ? (
                /* RESERVED, not ENTRY POINT: on a `single` card the entry point
                   IS the MIN amount in the cell beside it, so that tile said the
                   same thing twice. This is the figure web's SME ladder carries
                   and mobile did not. */
                <View style={s.lotCell}>
                  <Text style={s.lotK}>RESERVED</Text>
                  <Text style={s.lotV}>{shC(reqFor(g.cat))} <Text style={s.lotSm}>for 1×</Text></Text>
                </View>
              ) : single ? (
                <View style={s.lotCell}>
                  <Text style={s.lotK}>ENTRY POINT</Text>
                  <Text style={s.lotV}>{calc.crOrInr(g.min.amount)} <Text style={s.lotSm}>onward</Text></Text>
                </View>
              ) : (
                <View style={s.lotCell}>
                  <Text style={s.lotK}>MAX · {g.max.lots} LOTS</Text>
                  <Text style={s.lotV}>{g.max.shares.toLocaleString('en-IN')} <Text style={s.lotSm}>sh · {calc.crOrInr(g.max.amount)}</Text></Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ── Timeline rail — filled indigo dots for past, grey for future ───────── */
export function TimelinePanel({ ipo }: { ipo: IpoFull }) {
  const states = timelineStates(calc.timeline(ipo));
  const todayMs = istTodayMs(); // IST midnight; was a UTC date reopened locally
  return (
    <View>
      {states.map(({ item, ms, state }, i) => (
        <View style={s.tlRow} key={item.label}>
          <View style={s.tlCol}>
            <View style={[s.tlConn, i === 0 && { backgroundColor: 'transparent' }, state === 'done' && s.tlConnDone]} />
            <View style={[s.tlNode, state === 'done' && s.tlNodeDone, state === 'now' && s.tlNodeNow]}>
              {state === 'done' ? <CheckIcon size={11} color="#ffffff" strokeWidth={3} />
                : state === 'now' ? <ClockIcon size={11} color={ui.indigo} strokeWidth={2.2} /> : null}
            </View>
          </View>
          <View style={s.tlBody}>
            <View style={{ flex: 1 }}>
              <Text style={[s.tlLbl, state === 'now' && { color: ui.indigo }]}>{item.label}</Text>
              <Text style={s.tlRel}>{relText(ms, todayMs, state === 'done')}</Text>
            </View>
            <Text style={s.tlDate}>{fmtDate(item.date)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── Grey-market premium (always with the disclaimer) ───────────────────── */
export function GmpPanel({ ipo, disclaimer }: { ipo: IpoFull; disclaimer: string }) {
  const upper = ipo.priceBandMax ?? ipo.priceBandMin ?? 0;
  return (
    <View>
      {ipo.gmp != null ? (
        /* `compact`: this panel already prints its own standing disclaimer
           below, so the chip must not repeat it. */
        <GmpReveal compact>
        <View>
          <View style={s.kv}>
            <Text style={s.kvK}>Premium / share</Text>
            <Text style={s.kvV}>{ipo.gmp >= 0 ? '▲ +' : '▼ '}₹{Math.abs(ipo.gmp)}</Text>
          </View>
          <View style={s.kv}>
            <Text style={s.kvK}>{LABEL.gmp} %</Text>
            <Text style={s.kvV}>{ipo.gmp >= 0 ? '+' : ''}{ipo.gmpPct ?? '—'}%</Text>
          </View>
          <View style={[s.kv, { borderBottomWidth: 0 }]}>
            <Text style={s.kvK}>Est. listing price</Text>
            <Text style={s.kvV}>₹{upper + ipo.gmp}</Text>
          </View>
        </View>
        </GmpReveal>
      ) : (
        <Text style={s.muted}>No grey-market data yet.</Text>
      )}
      <Text style={s.disclaimer}>GMP is unofficial · not investment advice</Text>
    </View>
  );
}

const s = StyleSheet.create({
  /* QIB sub-rows: indented and dimmed, so they read as a breakdown of the
     row above rather than four more categories. */
  qibSub: { paddingLeft: 14 },
  qibSubCat: { color: ui.slate, fontFamily: fonts.semibold, fontWeight: '600' },
  qibSubX: { color: ui.slate },
  /* --- subscription hero (fix 3) ---------------------------------------- */
  heroWrap: { marginBottom: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  /* 30px: "264.70×" is 124.4px at this weight, well inside the 296px card
     inner at 360. adjustsFontSizeToFit guards a figure we have not seen. */
  heroTimes: { fontSize: 30, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  heroTimesX: { fontSize: 19, fontFamily: fonts.bold, fontWeight: '700' },
  heroTone: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', flexShrink: 1 },
  heroTrack: { height: 7, borderRadius: 4, backgroundColor: ui.slateTint, overflow: 'hidden', marginTop: 8 },
  heroFill: { height: '100%', borderRadius: 4 },
  heroTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  /* 11px is the A3 floor; slate not muted, which fails AA for text. */
  heroTick: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, fontVariant: ['tabular-nums'] },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  heroTile: { flex: 1, backgroundColor: ui.canvas, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8 },
  heroTileK: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  heroTileV: { fontSize: 14, fontFamily: fonts.bold, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  muted: { fontFamily: fonts.regular, fontSize: 13.5, color: ui.slate, lineHeight: 19 },
  /* subscription */
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 7 },
  subCat: { ...microLabel, width: 64, fontSize: 11 },
  subMid: { flex: 1 },
  track: { height: 6, backgroundColor: ui.slateTint, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  subBook: { fontFamily: fonts.regular, fontSize: 11, color: ui.slate, marginTop: 4, fontVariant: ['tabular-nums'] },
  subX: { width: 56, textAlign: 'right', fontSize: 14.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  /* 82px rather than 56: the widest compact figure in the catalogue is
     "₹2,01,472" at ~77px. The room comes from `subMid`, which is flex and
     only loses bar width. A rupee figure is never dimmed the way a
     sub-1x multiple is — a small book is not an under-subscription. */
  subXMoney: { width: 82 },
  subUnder: { color: ui.slate },
  subTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.divider,
  },
  subTotalK: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  subTotalV: { fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  /* Share-wise / Application-wise toggle — the house seg pattern from the home
     tab (slateTint trough, white raised pill), narrowed to sit inside a Card. */
  subSeg: {
    flexDirection: 'row', backgroundColor: ui.slateTint, borderRadius: 11, padding: 3, marginBottom: 12,
  },
  subSegBtn: { flex: 1, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  subSegBtnOn: { backgroundColor: '#ffffff', ...shadowCard, elevation: 2 },
  /* alignSelf + textAlign, not a width: the button is a column with
     alignItems 'center', which shrink-wraps this label to its own measurement
     — and a measurement one glyph short of the draw cut the tail off "All",
     "Mainboard" and "SME" alike inside a button with 46px to spare. Filling
     the button and centring the text means any such error lands in the slack. */
  subSegTxt: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate, alignSelf: 'stretch', textAlign: 'center' },
  subSegTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  /* reservation */
  alloc: { flexDirection: 'row', height: 28, borderRadius: 9, overflow: 'hidden', marginBottom: 12 },
  allocSeg: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  allocTxt: { fontSize: 11, fontFamily: fonts.bold, fontWeight: '700' },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legWho: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  legNum: { fontFamily: fonts.regular, fontSize: 12, color: ui.slate, marginTop: 1, fontVariant: ['tabular-nums'] },
  legPct: { fontSize: 14, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  /* lots */
  lotCard: { backgroundColor: ui.canvas, borderRadius: 14, padding: 13, borderLeftWidth: 3 },
  lotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lotWho: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  lotBand: { fontSize: 12, fontFamily: fonts.medium, fontWeight: '500', color: ui.slate },
  lotTag: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate, fontVariant: ['tabular-nums'] },
  lotGrid: { flexDirection: 'row', gap: 12, marginTop: 10 },
  lotCell: { flex: 1 },
  /* The one microLabel override left in place (QC A3). The 3-cell lotGrid
     is 91px wide at 360 and "MAX · 130 LOTS" ALREADY measures 90.3px at
     10.5; there is no numberOfLines, so it wraps. The cell is too narrow
     for the string it holds, which is a layout fault rather than a type
     one - raising this would deepen a wrap that already happens. */
  lotK: { ...microLabel, fontSize: 10.5 },
  lotV: { fontSize: 14.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 3, fontVariant: ['tabular-nums'] },
  lotSm: { fontSize: 11.5, fontFamily: fonts.medium, fontWeight: '500', color: ui.slate },
  /* timeline */
  tlRow: { flexDirection: 'row', gap: 12 },
  tlCol: { width: 20, alignItems: 'center' },
  tlConn: { width: 2, height: 10, backgroundColor: ui.divider },
  tlConnDone: { backgroundColor: ui.indigo },
  tlNode: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: ui.divider,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  tlNodeDone: { backgroundColor: ui.indigo, borderColor: ui.indigo },
  tlNodeNow: { borderColor: ui.indigo },
  tlBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingBottom: 14, marginTop: 8 },
  tlLbl: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  tlRel: { fontFamily: fonts.regular, fontSize: 11.5, color: ui.slate, marginTop: 1 },
  tlDate: { fontSize: 12.5, color: ui.slate, fontFamily: fonts.semibold, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },
  /* gmp */
  kv: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: ui.divider,
  },
  kvK: { fontFamily: fonts.regular, fontSize: 14, color: ui.body },
  kvV: { fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  /* No pos/neg pair here on purpose. GMP was their only user, and a
     green/red pair sitting beside an indicative figure is an invitation
     to re-apply it. Realised gains are coloured where they are realised:
     the listing result on the card and in applications. (QC C2) */
  disclaimer: { fontFamily: fonts.regular, fontSize: 11, color: ui.slate, marginTop: 10 },
  /* Same weight as the GMP disclaimer: a caveat, not a figure. */
  anchorNote: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: ui.slate, marginTop: 10 },
});
