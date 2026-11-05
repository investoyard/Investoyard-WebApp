/**
 * Watchlist — the issues this investor asked to be told about.
 *
 * The bell has existed for months and there was nowhere to SEE what it had
 * collected: `RemindBell` toggles a server row that drives the hourly alert
 * sweep, and the only way to find out whether an issue was on the list was to
 * navigate to it and look at the bell.
 *
 * WHAT A BELL ACTUALLY DOES IS SHOWN, NOT OFFERED AS A CHOICE. The design asks
 * for a reminder chip per event, and `WatchlistItem` is `(userId, ipoId)` with
 * no preference column — so a chip row here would be four controls that change
 * nothing. The sweep sends all four events to every watcher (`ipo_open`,
 * `ipo_closing`, `ipo_allotment`, `ipo_listing`), so the row states those four
 * with their dates and dims the ones already past. Per-event opt-out needs a
 * schema column, which is a handshake.
 *
 * NOTHING IS REMOVED BEHIND THE INVESTOR'S BACK. The design says an issue
 * "moves to your Home Moment and leaves the watchlist" when it opens; dropping
 * the server row would cancel the allotment and listing alerts, which are the
 * ones people actually set the bell for. So an issue that is live today is
 * grouped under a heading saying where to find it, and keeps its reminders.
 *
 * EN-LITERAL, matching `subscription.tsx`, `gmp.tsx` and `performance.tsx`,
 * which carry no `t()` calls either. The Hindi pass covers them together.
 *
 * AN UNREACHABLE API SHOWS OFFLINE, NEVER AN EMPTY WATCHLIST. `getIposResult()`
 * and `listApplicationsResult()` say which happened, so the screen never has
 * to infer it — the catalogue failing takes over, the applications failing
 * only costs a bar.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isLiveApplication, istToday, momentPlan, shortName, type ActiveMomentKind } from '@investoyard/shared-types';
import { fonts, ui } from '../lib/theme';
import { useAuth } from '../components/auth';
import { getIposResult, listApplicationsResult } from '../lib/api';
import { invalidateWatched, setWatched, watchedIds } from '../lib/watchlist';
import type { IpoFull } from '../lib/ipoCalc';
import { stageOf } from '../lib/ipoStage';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoginGate } from '../components/ui/LoginGate';
import { SkeletonCard } from '../components/ui/Skeleton';
import { LoadFailure, LoadFailureBar, type FailureReason } from '../components/ui/LoadFailure';
import { BellIcon } from '../components/ui/icons';
import { fmtDate } from '../lib/format';

/** What a live issue is doing today, so the heading can say where it is. */
const MOMENT_LINE: Record<ActiveMomentKind, string> = {
  listing: 'Listed today',
  allotment: 'Allotment out today',
  closing: 'Closing today',
  open: 'Open now',
};

/** The four events the alert sweep fires, in the order they happen. */
const EVENTS: { label: string; of: (i: IpoFull) => string | undefined }[] = [
  { label: 'Opens', of: (i) => i.openDate },
  { label: 'Closes', of: (i) => i.closeDate },
  { label: 'Allotment', of: (i) => i.allotmentDate },
  { label: 'Listing', of: (i) => i.listingDate },
];

type Row = { id: string; ipo?: IpoFull; moment?: ActiveMomentKind; applied?: boolean };
type Group = { key: string; title: string; note?: string; rows: Row[] };

export default function WatchlistScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState<FailureReason | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      if (!token) return;
      if (fresh) invalidateWatched();
      const [ids, iposR, appsR] = await Promise.all([
        watchedIds(token),
        getIposResult(),
        listApplicationsResult(token),
      ]);

      /* THE CATALOGUE IS FATAL: without it there is nothing to render, and an
         empty state over a list we simply could not fetch is the fault this app
         removed its mock catalogue to avoid. */
      if (!iposR.ok) {
        setFailed(iposR.reason);
        setGroups(null);
        return;
      }
      const all = iposR.ipos;
      /* THE APPLICATIONS ARE NOT. The rows still render; only the grouping is
         less precise, so this takes the bar rather than the screen. */
      const apps = appsR.ok ? appsR.data : [];
      setFailed(appsR.ok ? null : appsR.reason);

      const byId = new Map(all.map((i) => [i.id, i]));
      const watched = [...ids].map((id) => ({ id, ipo: byId.get(id) }));
      const live = watched.filter((r): r is { id: string; ipo: IpoFull } => !!r.ipo);

      /* Which of these the family is actually in. The engine needs it to
         decide whether a result Moment is theirs to see, and `isLiveApplication`
         is the apply screen's own rule rather than a second reading of it. */
      const appliedIpoIds = new Set(
        apps.filter((a) => isLiveApplication(a.status)).map((a) => a.ipoId),
      );
      const appliedSymbols = live
        .filter((r) => appliedIpoIds.has(r.id))
        .map((r) => r.ipo.symbol);

      const plan = momentPlan(live.map((r) => r.ipo), appliedSymbols);
      const kindBySymbol = new Map(plan.all.map((c) => [c.symbol, c.kind]));

      const nowRows: Row[] = [];
      const soonRows: Row[] = [];
      const doneRows: Row[] = [];

      for (const r of live) {
        const applied = appliedIpoIds.has(r.id);
        const moment = kindBySymbol.get(r.ipo.symbol);
        if (moment) {
          nowRows.push({ ...r, moment, applied });
          continue;
        }
        const stage = stageOf(r.ipo).stage;
        if (stage === 'upcoming' || stage === 'preapply') soonRows.push({ ...r, applied });
        else doneRows.push({ ...r, applied });
      }

      nowRows.sort((a, b) => a.ipo!.symbol.localeCompare(b.ipo!.symbol));
      soonRows.sort((a, b) => {
        const ad = a.ipo!.openDate ?? '';
        const bd = b.ipo!.openDate ?? '';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.ipo!.symbol.localeCompare(b.ipo!.symbol);
      });

      /* A watched id the catalogue no longer carries — hidden by the operator,
         or removed. Shown rather than dropped, because an invisible row is one
         the investor cannot get rid of. */
      const gone: Row[] = watched.filter((r) => !r.ipo);

      const next: Group[] = [];
      if (nowRows.length)
        next.push({
          key: 'now',
          title: 'Happening now',
          note: 'These are on your Home screen too.',
          rows: nowRows,
        });
      if (soonRows.length)
        next.push({ key: 'soon', title: 'Coming up', rows: soonRows });
      if (doneRows.length)
        next.push({
          key: 'done',
          title: 'Finished',
          note: 'Nothing further will be sent for these.',
          rows: doneRows,
        });
      if (gone.length)
        next.push({
          key: 'gone',
          title: 'No longer listed',
          note: 'We no longer carry these issues.',
          rows: gone,
        });

      setGroups(next);
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!token) return <LoginGate body="Sign in to see the issues you are following." />;

  const onRemove = async (row: Row) => {
    if (!token || removing) return;
    setRemoving(row.id);
    const ok = await setWatched(token, row.id, false);
    if (ok) await load();
    setRemoving(null);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.indigo} colors={[ui.indigo]} />
      }
    >
      <Text style={styles.note}>
        We will tell you when an issue you follow opens, is about to close, has its allotment out, and lists.
      </Text>

      {failed && groups !== null ? <LoadFailureBar reason={failed} onRetry={() => load(true)} /> : null}
      {failed && groups === null ? (
        <LoadFailure reason={failed} onRetry={() => load(true)} />
      ) : groups === null ? (
        <View style={{ gap: 12, marginTop: 14 }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={26} color={ui.indigo} />}
          title="You are not following any IPOs"
          body="Tap the bell on any IPO and we will remind you at every stage."
          cta={<Button label="Browse IPOs" onPress={() => router.push('/ipos')} />}
        />
      ) : (
        groups.map((g) => (
          <View key={g.key}>
            <Text style={styles.groupLbl}>{g.title.toUpperCase()}</Text>
            {g.note ? <Text style={styles.groupNote}>{g.note}</Text> : null}
            {g.rows.map((row) => (
              <WatchRow
                key={row.id}
                row={row}
                busy={removing === row.id}
                onOpen={row.ipo ? () => router.push(`/ipo/${row.ipo!.symbol}`) : undefined}
                onRemove={() => onRemove(row)}
              />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function WatchRow({
  row,
  busy,
  onOpen,
  onRemove,
}: {
  row: Row;
  busy: boolean;
  onOpen?: () => void;
  onRemove: () => void;
}) {
  const { ipo } = row;
  const today = istToday();

  if (!ipo) {
    return (
      <Card style={{ marginTop: 12 }}>
        <Text style={styles.name}>This issue is no longer in our catalogue</Text>
        <Text style={styles.muted}>Remove it to stop it taking up space here.</Text>
        <Button
          small
          variant="danger"
          label="Remove"
          busy={busy}
          onPress={onRemove}
          style={{ alignSelf: 'flex-start', marginTop: 12 }}
        />
      </Card>
    );
  }

  const st = stageOf(ipo);
  const name = shortName(ipo.name) || ipo.symbol;

  return (
    <Card style={{ marginTop: 12 }} onPress={onOpen}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Chip label={st.label} tone={st.tone} />
      </View>

      <Text style={styles.muted}>
        {ipo.symbol}
        {ipo.type ? ` · ${ipo.type === 'sme' ? 'SME' : 'Mainboard'}` : ''}
        {row.moment ? ` · ${MOMENT_LINE[row.moment]}` : ''}
        {row.applied ? ' · You applied' : ''}
      </Text>

      {/* What we will tell you about, and when. Dimmed once the date is past —
          an event already behind us is context, not a pending alert. */}
      <View style={styles.events}>
        {EVENTS.map((e) => {
          const d = e.of(ipo);
          if (!d) return null;
          const past = d.slice(0, 10) < today;
          return (
            <View key={e.label} style={[styles.ev, past && styles.evPast]}>
              <Text style={[styles.evTxt, past && styles.evTxtPast]}>
                {e.label} {fmtDate(d.slice(0, 10))}
              </Text>
            </View>
          );
        })}
      </View>

      <Button
        small
        variant="danger"
        label="Remove"
        busy={busy}
        onPress={onRemove}
        style={{ alignSelf: 'flex-start', marginTop: 12 }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.canvas },
  note: { fontFamily: fonts.regular, color: ui.slate, fontSize: 13, lineHeight: 18 },
  groupLbl: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.6,
    color: ui.slate,
    marginTop: 22,
  },
  groupNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: ui.slate,
    marginTop: 4,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 15, fontFamily: fonts.bold, fontWeight: '700', color: ui.title, flex: 1 },
  muted: {
    color: ui.slate,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    marginTop: 7,
    fontVariant: ['tabular-nums'],
  },
  events: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  ev: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: ui.indigoTint,
  },
  evPast: { backgroundColor: ui.slateTint },
  evTxt: {
    fontFamily: fonts.semibold,
    fontWeight: '600',
    fontSize: 11,
    color: ui.indigo,
    fontVariant: ['tabular-nums'],
  },
  evTxtPast: { color: ui.slate },
});
