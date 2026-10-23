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
import { LABEL, anchorNote, appWiseRows, orderShareRows, shareWiseLabel } from '@investoyard/shared-types';

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
              {single ? (
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
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
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
        <View>
          <View style={s.kv}>
            <Text style={s.kvK}>Premium / share</Text>
            <Text style={[s.kvV, ipo.gmp >= 0 ? s.pos : s.neg]}>{ipo.gmp >= 0 ? '▲ +' : '▼ '}₹{ipo.gmp}</Text>
          </View>
          <View style={s.kv}>
            <Text style={s.kvK}>{LABEL.gmp} %</Text>
            <Text style={[s.kvV, ipo.gmp >= 0 ? s.pos : s.neg]}>{ipo.gmp >= 0 ? '+' : ''}{ipo.gmpPct ?? '—'}%</Text>
          </View>
          <View style={[s.kv, { borderBottomWidth: 0 }]}>
            <Text style={s.kvK}>Est. listing price</Text>
            <Text style={s.kvV}>₹{upper + ipo.gmp}</Text>
          </View>
        </View>
      ) : (
        <Text style={s.muted}>No grey-market data yet.</Text>
      )}
      <Text style={s.disclaimer}>GMP is unofficial · not investment advice</Text>
    </View>
  );
}

const s = StyleSheet.create({
  muted: { fontFamily: fonts.regular, fontSize: 13.5, color: ui.muted, lineHeight: 19 },
  /* subscription */
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 7 },
  subCat: { ...microLabel, width: 64, fontSize: 11 },
  subMid: { flex: 1 },
  track: { height: 6, backgroundColor: ui.slateTint, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  subBook: { fontFamily: fonts.regular, fontSize: 11, color: ui.muted, marginTop: 4, fontVariant: ['tabular-nums'] },
  subX: { width: 56, textAlign: 'right', fontSize: 14.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  /* 82px rather than 56: the widest compact figure in the catalogue is
     "₹2,01,472" at ~77px. The room comes from `subMid`, which is flex and
     only loses bar width. A rupee figure is never dimmed the way a
     sub-1x multiple is — a small book is not an under-subscription. */
  subXMoney: { width: 82 },
  subUnder: { color: ui.muted },
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
  subSegBtn: { flex: 1, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  subSegBtnOn: { backgroundColor: '#ffffff', ...shadowCard, elevation: 2 },
  subSegTxt: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600', color: ui.slate },
  subSegTxtOn: { color: ui.indigo, fontFamily: fonts.bold, fontWeight: '700' },
  /* reservation */
  alloc: { flexDirection: 'row', height: 28, borderRadius: 9, overflow: 'hidden', marginBottom: 12 },
  allocSeg: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  allocTxt: { fontSize: 10.5, fontFamily: fonts.bold, fontWeight: '700' },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legWho: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  legNum: { fontFamily: fonts.regular, fontSize: 12, color: ui.muted, marginTop: 1, fontVariant: ['tabular-nums'] },
  legPct: { fontSize: 14, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  /* lots */
  lotCard: { backgroundColor: ui.canvas, borderRadius: 14, padding: 13, borderLeftWidth: 3 },
  lotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lotWho: { fontSize: 13.5, fontFamily: fonts.bold, fontWeight: '700', color: ui.title },
  lotBand: { fontSize: 12, fontFamily: fonts.medium, fontWeight: '500', color: ui.muted },
  lotTag: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', color: ui.slate, fontVariant: ['tabular-nums'] },
  lotGrid: { flexDirection: 'row', gap: 12, marginTop: 10 },
  lotCell: { flex: 1 },
  lotK: { ...microLabel, fontSize: 10.5 },
  lotV: { fontSize: 14.5, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, marginTop: 3, fontVariant: ['tabular-nums'] },
  lotSm: { fontSize: 11.5, fontFamily: fonts.medium, fontWeight: '500', color: ui.muted },
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
  tlRel: { fontFamily: fonts.regular, fontSize: 11.5, color: ui.muted, marginTop: 1 },
  tlDate: { fontSize: 12.5, color: ui.slate, fontFamily: fonts.semibold, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },
  /* gmp */
  kv: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: ui.divider,
  },
  kvK: { fontFamily: fonts.regular, fontSize: 14, color: ui.body },
  kvV: { fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800', color: ui.title, fontVariant: ['tabular-nums'] },
  pos: { color: ui.green },
  neg: { color: ui.red },
  disclaimer: { fontFamily: fonts.regular, fontSize: 10, color: ui.muted, marginTop: 10 },
  /* Same weight as the GMP disclaimer: a caveat, not a figure. */
  anchorNote: { fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 15, color: ui.muted, marginTop: 10 },
});
