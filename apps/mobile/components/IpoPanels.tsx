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
import { LABEL, appWiseRows } from '@investoyard/shared-types';

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
  const [view, setView] = useState<'shares' | 'apps'>('shares');
  const t = calc.subscriptionTable(ipo);
  if (!t) return <Text style={s.muted}>Subscription not open yet.</Text>;

  const appRows = appWiseRows(t.rows);
  const hasApps = appRows.length > 0;
  const shown = hasApps ? view : 'shares';
  const rows = shown === 'apps' ? appRows : t.rows;
  const totalApps = appRows.reduce((n, r) => n + (r.bidCount ?? 0), 0);

  return (
    <View>
      {hasApps ? (
        <View style={s.subSeg}>
          {([['shares', 'Share-wise'], ['apps', 'Application-wise']] as const).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setView(k)}
              style={({ pressed }) => [s.subSegBtn, shown === k && s.subSegBtnOn, pressed && { opacity: 0.8 }]}
            >
              <Text style={[s.subSegTxt, shown === k && s.subSegTxtOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {rows.map((r) => {
        /* The bar is the same 15× ramp in both views so a reader switching
           between them is comparing like with like. */
        const times = shown === 'apps' ? (r.applicationsTimes ?? 0) : r.times;
        const under = times < 1;
        const w = Math.max(4, Math.min(100, (times / 15) * 100));
        return (
          <View style={s.subRow} key={r.cat}>
            <Text style={s.subCat}>{r.cat}</Text>
            <View style={s.subMid}>
              <View style={s.track}>
                <View style={[s.fill, { width: `${w}%`, backgroundColor: catColor(r.cat) }]} />
              </View>
              <Text style={s.subBook}>
                {shown === 'apps'
                  /* Applications RECEIVED against those needed for 1× — the two
                     figures the Reserved column on an SME lot ladder does not
                     carry, which is why this view exists at all. */
                  ? `need ${shC(r.req1x ?? 0)} for 1× · got ${shC(r.bidCount ?? 0)}`
                  : `book ${shC(r.bookSize)} · applied ${shC(r.subscribed)}`}
              </Text>
            </View>
            <Text style={[s.subX, under && s.subUnder]}>{times}×</Text>
          </View>
        );
      })}

      <View style={s.subTotal}>
        <Text style={s.subTotalK}>
          {shown === 'apps' ? 'Total applications' : 'Total subscription'}
        </Text>
        <Text style={s.subTotalV}>
          {shown === 'apps' ? shC(totalApps) : `${t.total.times}×`}
        </Text>
      </View>
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
});
