'use client';
import { useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import * as api from '@/lib/tenants-admin';

const ACTIONS: { value: api.BotAction; label: string }[] = [
  { value: 'text', label: 'Custom text reply' },
  { value: 'open', label: 'Open IPOs (live list)' },
  { value: 'upcoming', label: 'Upcoming IPOs (live list)' },
  { value: 'listed', label: 'Recently listed (live list)' },
  { value: 'gmp', label: 'Grey-market premium (live)' },
];

const kwStr = (a: string[]) => a.join(', ');
const kwArr = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function ChatbotPage() {
  const me = useOperator();
  const [flow, setFlow] = useState<api.BotFlow | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('menu');
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { api.fetchBotFlow().then(setFlow).catch((e) => setErr(String(e?.message ?? e))); }, []);

  if (!operatorCan(me, 'chatbot.manage')) return <NoAccess />;
  if (!flow) return <Loader />;

  const patch = (p: Partial<api.BotFlow>) => setFlow((f) => (f ? { ...f, ...p } : f));
  const setMenu = (menu: api.BotMenuItem[]) => patch({ menu });
  const setFaqs = (faqs: api.BotFaq[]) => patch({ faqs });
  const updItem = (i: number, p: Partial<api.BotMenuItem>) => setMenu(flow.menu.map((m, x) => (x === i ? { ...m, ...p } : m)));
  const move = (i: number, d: number) => { const n = [...flow.menu]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setMenu(n); };
  const delItem = (i: number) => setMenu(flow.menu.filter((_, x) => x !== i));
  const addItem = () => setMenu([...flow.menu, { key: String(flow.menu.length + 1), label: 'New option', keywords: [], action: 'text', text: '' }]);
  const updFaq = (i: number, p: Partial<api.BotFaq>) => setFaqs(flow.faqs.map((m, x) => (x === i ? { ...m, ...p } : m)));
  const delFaq = (i: number) => setFaqs(flow.faqs.filter((_, x) => x !== i));
  const addFaq = () => setFaqs([...flow.faqs, { keywords: [], answer: '' }]);

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try { const out = await api.saveBotFlow(flow); setFlow(out); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const runTest = async () => {
    setTesting(true); setTestReply(null);
    try { const { reply } = await api.testBot(testMsg); setTestReply(reply); }
    catch (e: any) { setTestReply('Error: ' + String(e?.message ?? e)); }
    finally { setTesting(false); }
  };

  return (
    <>
      <PageHead
        title="Chatbot Flow"
        sub="Level-1 WhatsApp bot — set the menu, keyword answers (FAQs) and fallback. Live IPO actions (Open / Upcoming / GMP) pull real catalog data. Save to go live instantly — no code."
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>

        {/* Guided (multi-level) flow toggle */}
        <div className="panel">
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={flow.guidedFlows !== false} onChange={(e) => patch({ guidedFlows: e.target.checked })} />
            <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              <b>Guided flow (tappable, multi-level)</b> — the bot sends tappable IPO lists → tap an IPO → <i>Subscription / GMP / Apply</i> → <b>apply inside WhatsApp</b> (verified by the sender’s mobile + a one-time code → pick applicant → lots → confirm → creates a real application).
              <br /><span className="muted">Requires a connected Meta WhatsApp account (interactive messages). When off, the keyword menu + FAQs below run as plain text. The menu/FAQs below still power keyword answers and the fallback in both modes.</span>
            </span>
          </label>
        </div>

        {/* Welcome & fallback */}
        <div className="panel">
          <h3 style={{ margin: '0 0 12px' }}>Welcome & fallback</h3>
          <div className="form-grid">
            <label className="field"><span className="muted">Greeting (top of the menu)</span>
              <textarea className="input" rows={2} value={flow.greeting} onChange={(e) => patch({ greeting: e.target.value })} /></label>
            <label className="field"><span className="muted">Closing line (under the menu)</span>
              <input className="input" value={flow.closing} onChange={(e) => patch({ closing: e.target.value })} /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}><span className="muted">Fallback — when nothing matches (and AI is off)</span>
              <textarea className="input" rows={2} value={flow.fallback} onChange={(e) => patch({ fallback: e.target.value })} /></label>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Tip: use <code>*bold*</code>, <code>_italic_</code> (WhatsApp formatting) and <code>{'{site}'}</code> for your website link.</p>
        </div>

        {/* Menu options */}
        <div className="panel">
          <div className="between"><h3 style={{ margin: 0 }}>Menu options</h3><button className="btn btn-secondary btn-sm" onClick={addItem}>+ Add option</button></div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Each option shows as <b>key · label</b>. A user triggers it by typing the key (e.g. <code>1</code>) or any keyword.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {flow.menu.map((m, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <div className="form-grid">
                  <label className="field" style={{ maxWidth: 90 }}><span className="muted">Key</span><input className="input" value={m.key} onChange={(e) => updItem(i, { key: e.target.value })} /></label>
                  <label className="field"><span className="muted">Label</span><input className="input" value={m.label} onChange={(e) => updItem(i, { label: e.target.value })} /></label>
                  <label className="field"><span className="muted">Action</span>
                    <select className="input" value={m.action} onChange={(e) => updItem(i, { action: e.target.value as api.BotAction })}>
                      {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select></label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}><span className="muted">Trigger keywords (comma-separated)</span>
                    <input className="input" value={kwStr(m.keywords)} onChange={(e) => updItem(i, { keywords: kwArr(e.target.value) })} placeholder="open, live" /></label>
                  {m.action === 'text' && (
                    <label className="field" style={{ gridColumn: '1 / -1' }}><span className="muted">Reply text</span>
                      <textarea className="input" rows={4} value={m.text ?? ''} onChange={(e) => updItem(i, { text: e.target.value })} /></label>
                  )}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="icon-btn" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button className="icon-btn" title="Move down" onClick={() => move(i, 1)} disabled={i === flow.menu.length - 1}>↓</button>
                  <button className="btn btn-secondary btn-sm danger" onClick={() => delItem(i)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="panel">
          <div className="between"><h3 style={{ margin: 0 }}>Keyword answers (FAQs)</h3><button className="btn btn-secondary btn-sm" onClick={addFaq}>+ Add FAQ</button></div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>If a message contains any keyword, the bot replies with the answer. Good for “charges”, “contact”, etc.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {flow.faqs.length === 0 && <p className="muted">No FAQs yet.</p>}
            {flow.faqs.map((f, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <div className="form-grid">
                  <label className="field" style={{ gridColumn: '1 / -1' }}><span className="muted">Keywords (comma-separated)</span>
                    <input className="input" value={kwStr(f.keywords)} onChange={(e) => updFaq(i, { keywords: kwArr(e.target.value) })} placeholder="charges, fees, cost" /></label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}><span className="muted">Answer</span>
                    <textarea className="input" rows={3} value={f.answer} onChange={(e) => updFaq(i, { answer: e.target.value })} /></label>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn btn-secondary btn-sm danger" onClick={() => delFaq(i)}>Remove</button></div>
              </div>
            ))}
          </div>
        </div>

        {/* Save + test */}
        <div className="panel">
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save flow'}</button>
            {saved && <span style={{ color: 'var(--good, #187a48)', fontSize: 13 }}>Saved ✓</span>}
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--line, #e5e5ec)', margin: '16px 0' }} />
          <h3 style={{ margin: '0 0 8px' }}>Test the bot</h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Type a message as a user would and see the exact reply (uses live catalog data). Save first to test unsaved changes.</p>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ flex: 1 }} value={testMsg} onChange={(e) => setTestMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }} placeholder="e.g. menu, open, gmp, charges" />
            <button className="btn btn-secondary" disabled={testing} onClick={runTest}>{testing ? '…' : 'Send'}</button>
          </div>
          {testReply != null && (
            <div style={{ marginTop: 12, background: '#e7f7ee', border: '1px solid #bfe6cf', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{testReply}</div>
          )}
        </div>
      </div>
    </>
  );
}
