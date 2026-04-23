import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Client, Campaign } from '../types';
import { useAuth } from '../lib/AuthContext';
import { useSheetData, SheetRow, ClientGroup } from '../lib/useSheetData';
import {
  Users, TrendingUp, AlertCircle, CheckCircle2, Clock, Download,
  Plus, ArrowUpRight, Search, LayoutDashboard, Settings, LogOut, X,
  ChevronDown, ChevronRight, Pencil, BarChart2, RefreshCw, Zap,
  ExternalLink, Calendar, ChevronLeft, ChevronRight as ChevronRightIcon, Trash2, ArrowUp, ArrowDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { format, subDays, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import * as XLSX from 'xlsx';

type View = 'dashboard' | 'clients' | 'settings';
type AlertSeverity = 'OK' | 'WARNING' | 'CRITICAL';
type PeriodoMode = 'ieri' | 'last_7d' | 'last_14d' | 'last_30d' | 'custom';

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all placeholder:text-zinc-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-zinc-100 transition-all">
          <X className="w-5 h-5" />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

function StatusBadge({ status }: { status: AlertSeverity }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      status === 'OK'       && 'bg-emerald-500/10 text-emerald-500',
      status === 'WARNING'  && 'bg-amber-500/10 text-amber-500',
      status === 'CRITICAL' && 'bg-rose-500/10 text-rose-500'
    )}>
      {status === 'OK'       && <CheckCircle2 className="w-3 h-3" />}
      {status === 'WARNING'  && <Clock className="w-3 h-3" />}
      {status === 'CRITICAL' && <AlertCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

// ─── Selettore periodo + date range ──────────────────────────────────────────
function DateInput({
  label, value, min, max, onChange, disabled,
}: {
  label: string; value: string; min?: string; max?: string;
  onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider px-1">{label}</span>
      <div className={cn(
        "flex items-center gap-1.5 bg-zinc-800 border rounded-xl px-3 py-2 transition-colors",
        disabled ? "border-zinc-800 opacity-60" : "border-zinc-700 hover:border-blue-500 focus-within:border-blue-500"
      )}>
        <Calendar className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <input
          type="date"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{ colorScheme: 'dark' }}
          className="bg-transparent text-zinc-200 text-xs font-mono outline-none cursor-pointer w-[110px] disabled:cursor-default"
        />
      </div>
    </div>
  );
}

function PeriodoBar({
  mode, onMode,
  calFrom, calTo,
  onCalFrom, onCalTo,
  onApply,
}: {
  mode: PeriodoMode;
  onMode: (m: PeriodoMode) => void;
  calFrom: string;
  calTo: string;
  onCalFrom: (v: string) => void;
  onCalTo: (v: string) => void;
  onApply: () => void;
}) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isPreset = mode !== 'custom';

  const presets: { id: PeriodoMode; label: string }[] = [
    { id: 'ieri',     label: 'Ieri' },
    { id: 'last_7d',  label: '7 giorni' },
    { id: 'last_14d', label: '14 giorni' },
    { id: 'last_30d', label: '30 giorni' },
  ];

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* Bottoni preset */}
      <div className="flex items-center gap-1 bg-zinc-800 rounded-xl p-1">
        {presets.map(p => (
          <button
            key={p.id}
            onClick={() => onMode(p.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              mode === p.id ? 'bg-blue-600 text-white shadow' : 'text-zinc-300 hover:bg-zinc-700'
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => onMode('custom')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
            mode === 'custom' ? 'bg-blue-600 text-white shadow' : 'text-zinc-300 hover:bg-zinc-700'
          )}
        >
          <Calendar className="w-3 h-3" />
          Personalizzato
        </button>
      </div>

      {/* Calendario — sempre visibile, read-only per i preset */}
      <DateInput
        label="Dal"
        value={calFrom}
        max={calTo || todayStr}
        onChange={onCalFrom}
        disabled={isPreset}
      />
      <span className="text-zinc-600 text-xs mb-2.5">→</span>
      <DateInput
        label="Al"
        value={calTo}
        min={calFrom}
        max={todayStr}
        onChange={onCalTo}
        disabled={isPreset}
      />

      {/* Bottone Cerca solo in modalità custom */}
      <AnimatePresence>
        {mode === 'custom' && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
          >
            <button
              onClick={onApply}
              disabled={!calFrom || !calTo}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Search className="w-3 h-3" />
              Cerca
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helper: preset Meta API ─────────────────────────────────────────────────
function getMetaPreset(mode: PeriodoMode): string | undefined {
  const map: Record<PeriodoMode, string | undefined> = {
    ieri: 'yesterday', last_7d: 'last_7d', last_14d: 'last_14d', last_30d: 'last_30d', custom: undefined,
  };
  return map[mode];
}

function getPresetDates(mode: PeriodoMode): { from: string; to: string } | null {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  if (mode === 'ieri')     return { from: yesterday, to: yesterday };
  if (mode === 'last_7d')  return { from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),  to: yesterday };
  if (mode === 'last_14d') return { from: format(subDays(new Date(), 14), 'yyyy-MM-dd'), to: yesterday };
  if (mode === 'last_30d') return { from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: yesterday };
  return null;
}

// ─── Hook: dati on-demand da Meta API ────────────────────────────────────────
function buildClientGroups(rows: SheetRow[]): ClientGroup[] {
  const groupMap = new Map<string, ClientGroup>();
  for (const row of rows) {
    const key = row.cliente || 'N/A';
    if (!groupMap.has(key)) {
      groupMap.set(key, { cliente: key, lead: 0, spesa: 0, cpl: 0, impressioni: 0, click: 0, campagne: [] });
    }
    const g = groupMap.get(key)!;
    g.lead        += row.lead;
    g.spesa       += row.spesa;
    g.impressioni += row.impressioni;
    g.click       += row.click;
    g.campagne.push(row);
  }
  return [...groupMap.values()]
    .map(g => ({ ...g, cpl: g.lead > 0 ? g.spesa / g.lead : 0 }))
    .sort((a, b) => b.lead - a.lead);
}

function useMetaData(preset?: string, from?: string, to?: string) {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const fetch_ = useCallback(async () => {
    if (!preset && (!from || !to)) return;
    setLoading(true);
    setError(null);
    try {
      const params = preset
        ? `preset=${preset}`
        : `from=${from}&to=${to}`;
      const res = await fetch(`/api/meta-data?${params}`);
      if (!res.ok) throw new Error(`Errore HTTP ${res.status}`);
      const data: SheetRow[] = await res.json();
      setRows(data);
      setClientGroups(buildClientGroups(data));
      if (data.length > 0) {
        setDateRange({ from: data[0].dataDa, to: data[0].dataA });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { rows, clientGroups, loading, error, dateRange, refresh: fetch_ };
}

// ─── Modal: Soglia CPL per cliente ───────────────────────────────────────────
function ClientModal({
  clienteName, firestoreClient, onClose,
}: {
  clienteName: string;
  firestoreClient?: Client;
  onClose: () => void;
}) {
  const [cplThreshold, setCplThreshold] = useState(firestoreClient?.cplThreshold?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!cplThreshold || isNaN(Number(cplThreshold)) || Number(cplThreshold) < 0) {
      setError('Inserisci un valore valido'); return;
    }
    setSaving(true);
    try {
      if (firestoreClient) {
        await updateDoc(doc(db, 'clients', firestoreClient.id), { cplThreshold: parseFloat(cplThreshold) });
      } else {
        await addDoc(collection(db, 'clients'), { name: clienteName, cplThreshold: parseFloat(cplThreshold), active: true });
      }
      onClose();
    } catch (e: any) {
      setError('Errore: ' + (e?.message || 'Riprova'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!firestoreClient) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', firestoreClient.id));
      onClose();
    } catch (e: any) {
      setError('Errore eliminazione');
      setDeleting(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center gap-3 mb-5 pr-8">
        <div className="w-9 h-9 bg-blue-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold leading-tight">{clienteName}</h2>
          <p className="text-xs text-zinc-500">
            {firestoreClient ? 'Modifica soglia CPL' : 'Imposta soglia CPL'}
          </p>
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm mb-4 bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>}

      <Field label="Soglia CPL (€)">
        <input
          className={inputCls}
          type="number" min="0" step="0.01"
          value={cplThreshold}
          onChange={e => setCplThreshold(e.target.value)}
          placeholder="es. 15.00"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && save()}
        />
      </Field>

      <div className="flex gap-2 mt-6">
        {firestoreClient && (
          <button
            onClick={remove}
            disabled={deleting}
            className="px-4 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? '...' : 'Elimina'}
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-all">
          Annulla
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Card campagna (dettaglio) ────────────────────────────────────────────────
function CampaignRow({ row }: { row: SheetRow }) {
  const cpl = row.lead > 0 ? row.spesa / row.lead : 0;
  const accountNum = (row.accountId || '').replace('act_', '');
  const bmUrl = row.campaignId && accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}&selected_campaign_ids=${row.campaignId}`
    : null;

  return (
    <div className="flex items-center gap-4 bg-zinc-800/50 rounded-xl px-4 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Meta</span>
          <span className="text-sm font-medium truncate">{row.campagna}</span>
          {row.stato && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{row.stato}</span>}
        </div>
        <p className="text-xs text-zinc-500 mt-1 font-mono">
          {row.cliente === 'Vyda'
            ? `${formatNumber(row.lead)} vendite · ${formatCurrency(row.spesa)} · CPV ${formatCurrency(cpl)}`
            : `${formatNumber(row.lead)} lead · ${formatCurrency(row.spesa)} · CPL ${formatCurrency(cpl)}`}
          {row.dataDa ? ` · ${row.dataDa} → ${row.dataA}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right text-xs text-zinc-600">
          <div>{formatNumber(row.impressioni)} impr.</div>
          <div>{formatNumber(row.click)} click</div>
        </div>
        {bmUrl && (
          <a
            href={bmUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Apri in Meta Ads Manager"
            className="p-1.5 text-zinc-600 hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Tabella clienti riutilizzabile ───────────────────────────────────────────
function ClientTable({
  groups, getThreshold, getStatus, periodoLabel, onDetail, onMoveUp, onMoveDown, onThreshold,
}: {
  groups: ClientGroup[];
  getThreshold: (n: string) => number | null;
  getStatus: (g: ClientGroup) => AlertSeverity;
  periodoLabel: string;
  onDetail: (cliente: string) => void;
  onMoveUp: (cliente: string) => void;
  onMoveDown: (cliente: string) => void;
  onThreshold: (cliente: string) => void;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-800/30">
              {['', 'Cliente', `Lead (${periodoLabel})`, `Spesa (${periodoLabel})`, 'CPL', 'Soglia', 'Stato', ''].map((h, i) => (
                <th key={i} className="px-4 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {groups.map((g, idx) => {
              const threshold = getThreshold(g.cliente);
              const status = getStatus(g);
              return (
                <tr key={g.cliente} className="hover:bg-zinc-800/40 transition-colors">
                  {/* Frecce reordering */}
                  <td className="pl-3 pr-1 py-4">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => onMoveUp(g.cliente)}
                        disabled={idx === 0}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Sposta su"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onMoveDown(g.cliente)}
                        disabled={idx === groups.length - 1}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Sposta giù"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => onThreshold(g.cliente)}
                      className="text-left group/name"
                      title="Imposta/modifica soglia CPL"
                    >
                      <div className="font-semibold group-hover/name:text-blue-400 transition-colors flex items-center gap-1.5">
                        {g.cliente}
                        <Pencil className="w-3 h-3 text-zinc-600 group-hover/name:text-blue-400 opacity-0 group-hover/name:opacity-100 transition-all" />
                      </div>
                      <div className="text-xs text-zinc-500">{g.campagne.length} campagne</div>
                    </button>
                  </td>
                  <td className="px-4 py-4 font-mono">
                    {formatNumber(g.lead)}
                    {g.cliente === 'Vyda' && <span className="text-zinc-500 text-xs ml-1">(vendite)</span>}
                  </td>
                  <td className="px-4 py-4 font-mono">{formatCurrency(g.spesa)}</td>
                  <td className="px-4 py-4 font-mono font-semibold">{formatCurrency(g.cpl)}</td>
                  <td className="px-4 py-4 text-zinc-400 font-mono">
                    {threshold !== null ? formatCurrency(threshold) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-4"><StatusBadge status={status} /></td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => onDetail(g.cliente)}
                      className="p-2 text-zinc-500 hover:text-zinc-100 transition-all"
                      title="Dettaglio campagne"
                    >
                      <ArrowUpRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dashboard principale ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState(true);

  // Periodo — default "ieri"
  const [mode, setMode] = useState<PeriodoMode>('ieri');
  // Calendario: sempre visibile, aggiornato al preset selezionato
  const [calFrom, setCalFrom] = useState(() => format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [calTo,   setCalTo]   = useState(() => format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  // Date applicate (solo in modalità custom)
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo,   setAppliedTo]   = useState('');

  // Ordinamento clienti (persistito in localStorage)
  const [clientOrder, setClientOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('lp_client_order') || '[]'); } catch { return []; }
  });

  // Dati da Google Sheet (solo per lastUpdate nella sidebar)
  const sheet = useSheetData('mensile');

  // Dati da Meta API — sempre live per tutte le modalità
  const metaPreset = mode !== 'custom' ? getMetaPreset(mode) : undefined;
  const metaFrom   = mode === 'custom' ? appliedFrom : undefined;
  const metaTo     = mode === 'custom' ? appliedTo   : undefined;
  const meta = useMetaData(metaPreset, metaFrom, metaTo);

  // Sorgente dati attiva — sempre Meta API
  const isLive       = true;
  const rows         = meta.rows;
  const clientGroups = meta.clientGroups;
  const lastUpdate   = meta.dateRange.from ? `${meta.dateRange.from} → ${meta.dateRange.to}` : '';
  const dateRange    = meta.dateRange;
  const loading      = firestoreLoading || meta.loading;
  const dataError    = meta.error;
  const refresh      = meta.refresh;

  const [view, setView] = useState<View>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [thresholdModal, setThresholdModal] = useState<{ name: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubClients = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      setFirestoreLoading(false);
    });
    return () => unsubClients();
  }, [user]);

  const getThreshold = (clienteName: string): number | null => {
    const match = clients.find(c =>
      c.name.toLowerCase() === clienteName.toLowerCase() ||
      c.name.toLowerCase().includes(clienteName.toLowerCase()) ||
      clienteName.toLowerCase().includes(c.name.toLowerCase())
    );
    return match ? match.cplThreshold : null;
  };

  const getStatus = (group: ClientGroup): AlertSeverity => {
    const threshold = getThreshold(group.cliente);
    if (threshold === null || group.cpl === 0) return 'OK';
    if (group.cpl > threshold) return 'CRITICAL';
    if (group.cpl > threshold * 0.8) return 'WARNING';
    return 'OK';
  };

  const totalLeads    = clientGroups.reduce((s, g) => s + g.lead, 0);
  const totalSpend    = clientGroups.reduce((s, g) => s + g.spesa, 0);
  const totalCPL      = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const criticalCount = clientGroups.filter(g => getStatus(g) === 'CRITICAL').length;

  // Applica ordinamento personalizzato, poi filtra per ricerca
  const orderedGroups = useMemo(() => {
    if (clientOrder.length === 0) return clientGroups;
    return [...clientGroups].sort((a, b) => {
      const ai = clientOrder.indexOf(a.cliente);
      const bi = clientOrder.indexOf(b.cliente);
      if (ai === -1 && bi === -1) return b.lead - a.lead;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [clientGroups, clientOrder]);

  const filteredGroups = orderedGroups.filter(g =>
    g.cliente.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Etichetta breve per KPI e intestazioni tabella
  const periodoLabel =
    mode === 'ieri'     ? 'ieri' :
    mode === 'last_7d'  ? '7gg' :
    mode === 'last_14d' ? '14gg' :
    mode === 'last_30d' ? '30gg' :
    appliedFrom         ? `${appliedFrom}→${appliedTo}` : 'custom';

  // Etichetta estesa con date reali (visibile nell'header)
  const ieriDate = format(subDays(new Date(), 1), 'dd/MM/yyyy', { locale: it });
  const periodoDisplay =
    mode === 'ieri'     ? `Ieri: ${ieriDate}` :
    mode === 'last_7d'  ? (dateRange.from ? `Ultimi 7 giorni: ${dateRange.from} → ${dateRange.to}` : 'Ultimi 7 giorni') :
    mode === 'last_14d' ? (dateRange.from ? `Ultimi 14 giorni: ${dateRange.from} → ${dateRange.to}` : 'Ultimi 14 giorni') :
    mode === 'last_30d' ? (dateRange.from ? `Ultimi 30 giorni: ${dateRange.from} → ${dateRange.to}` : 'Ultimi 30 giorni') :
    (appliedFrom && appliedTo
      ? `Periodo: ${appliedFrom.split('-').reverse().join('/')} → ${appliedTo.split('-').reverse().join('/')}`
      : 'Seleziona un intervallo');

  const handleApplyCustom = () => {
    if (calFrom && calTo) {
      setAppliedFrom(calFrom);
      setAppliedTo(calTo);
    }
  };

  const handleModeChange = (m: PeriodoMode) => {
    setMode(m);
    if (m !== 'custom') {
      const dates = getPresetDates(m);
      if (dates) { setCalFrom(dates.from); setCalTo(dates.to); }
      setAppliedFrom(''); setAppliedTo('');
    }
  };

  // Funzione reordering clienti
  const moveClient = (name: string, dir: 'up' | 'down') => {
    setClientOrder(prev => {
      const base = prev.length > 0 ? prev : clientGroups.map(g => g.cliente);
      // Aggiungi eventuali nuovi clienti non ancora nell'ordine
      const allNames = clientGroups.map(g => g.cliente);
      const full = [...base, ...allNames.filter(n => !base.includes(n))];
      const idx = full.indexOf(name);
      if (idx === -1) return prev;
      const next = [...full];
      if (dir === 'up' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      if (dir === 'down' && idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      localStorage.setItem('lp_client_order', JSON.stringify(next));
      return next;
    });
  };

  const downloadExcel = () => {
    const data = rows.map(r => ({
      'Campagna': r.campagna, 'Cliente': r.cliente,
      'Lead': r.lead, 'Spesa €': r.spesa,
      'CPL €': r.lead > 0 ? +(r.spesa / r.lead).toFixed(2) : 0,
      'Impressioni': r.impressioni, 'Click': r.click,
      'CPM €': r.cpm, 'CPC €': r.cpc,
      'Dal': r.dataDa, 'Al': r.dataA,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Meta Ads ${periodoLabel}`);
    XLSX.writeFile(wb, `LeadPulse_${mode}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (firestoreLoading && clientGroups.length === 0 && !isLive) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Caricamento dati Meta Ads...</p>
        </div>
      </div>
    );
  }

  const navItems: { id: View; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
    { id: 'clients',   icon: <Users className="w-5 h-5" />,          label: 'Soglie CPL' },
    { id: 'settings',  icon: <Settings className="w-5 h-5" />,       label: 'Impostazioni' },
  ];

  const periodoBar = (
    <PeriodoBar
      mode={mode} onMode={handleModeChange}
      calFrom={calFrom} calTo={calTo}
      onCalFrom={setCalFrom} onCalTo={setCalTo}
      onApply={handleApplyCustom}
    />
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans">

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col p-6 z-20 transition-transform duration-300",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-tight">LeadPulse</span>
            <span className="text-[10px] text-zinc-500 font-medium leading-tight tracking-wide">by DNA Creative</span>
          </div>
        </div>

        <div className="mb-6 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-emerald-400">Dati live da Meta API</span>
          </div>
          {meta.dateRange.from && <p className="text-xs text-zinc-500 leading-tight">{meta.dateRange.from} → {meta.dateRange.to}</p>}
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setView(item.id); setSidebarOpen(false); }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-sm',
                view === item.id ? 'bg-blue-600/10 text-blue-500' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              )}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-zinc-800">
          <p className="text-xs text-zinc-600 px-4 mb-2 truncate">{user?.email}</p>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-red-400 transition-all font-medium text-sm">
            <LogOut className="w-5 h-5" />Esci
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-10 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="lg:ml-64 p-4 lg:p-8">
        <div className="flex items-center gap-4 mb-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 bg-zinc-800 rounded-xl">
            <LayoutDashboard className="w-5 h-5" />
          </button>
          <span className="font-bold text-lg">LeadPulse</span>
        </div>

        {/* ═══ DASHBOARD ════════════════════════════════════════════════════ */}
        {view === 'dashboard' && (
          <>
            <header className="flex flex-col gap-4 mb-8">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">
                    Buongiorno, {user?.displayName?.split(' ')[0] || 'Admin'} 👋
                  </h1>
                  <p className="text-zinc-400 text-sm mt-1">
                    Campagne Meta Ads — {format(new Date(), 'd MMMM yyyy', { locale: it })}
                  </p>
                  <p className="text-sm mt-1 font-medium text-blue-400">
                    📅 {periodoDisplay}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="hidden md:flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    {isLive ? 'Dati live da Meta API' : 'Dati automatici da Meta Ads'}
                  </span>
                  <button onClick={refresh} className="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-xl transition-all" title="Aggiorna">
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-blue-400")} />
                  </button>
                  <button onClick={downloadExcel} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-medium transition-all">
                    <Download className="w-4 h-4" />Excel
                  </button>
                </div>
              </div>
              {/* Barra periodo */}
              {periodoBar}
            </header>

            {/* Loading live */}
            {loading && isLive && (
              <div className="mb-6 flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-sm text-blue-300">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Recupero dati in tempo reale da Meta Ads...
              </div>
            )}

            {/* Errore */}
            {dataError && (
              <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-sm">
                <p className="font-semibold text-rose-400 mb-1">⚠️ Errore dati</p>
                <p className="text-zinc-400 text-xs">{dataError}</p>
              </div>
            )}

            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              {[
                { label: `Lead Totali (${periodoLabel})`,  value: formatNumber(totalLeads),    icon: <Users className="w-5 h-5 text-blue-500" /> },
                { label: `Spesa Totale (${periodoLabel})`, value: formatCurrency(totalSpend),  icon: <TrendingUp className="w-5 h-5 text-purple-500" /> },
                { label: `CPL Medio (${periodoLabel})`,    value: formatCurrency(totalCPL),    icon: <BarChart2 className="w-5 h-5 text-amber-500" /> },
                { label: 'Clienti Attivi',                 value: String(clientGroups.length), icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
                { label: 'Alert Critici',                  value: String(criticalCount),       icon: <AlertCircle className="w-5 h-5 text-rose-500" /> },
              ].map(stat => (
                <div key={stat.label} className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
                  <div className="p-2 bg-zinc-800 rounded-lg inline-block mb-3">{stat.icon}</div>
                  <p className="text-zinc-400 text-xs font-medium mb-1">{stat.label}</p>
                  <h3 className="text-2xl font-bold">{stat.value}</h3>
                </div>
              ))}
            </div>

            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text" placeholder="Cerca cliente..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
              />
            </div>

            {filteredGroups.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500 py-24">
                <TrendingUp className="w-10 h-10 opacity-30" />
                <p>
                  {mode === 'custom' && (!appliedFrom || !appliedTo)
                    ? 'Seleziona un intervallo di date e clicca Cerca.'
                    : 'Nessun dato per il periodo selezionato.'}
                </p>
              </div>
            ) : (
              <ClientTable
                groups={filteredGroups}
                getThreshold={getThreshold}
                getStatus={getStatus}
                periodoLabel={periodoLabel}
                onDetail={c => { setView('clients'); setExpandedClient(c); }}
                onMoveUp={n => moveClient(n, 'up')}
                onMoveDown={n => moveClient(n, 'down')}
                onThreshold={n => setThresholdModal({ name: n })}
              />
            )}

            {meta.dateRange.from && (
              <p className="text-center text-xs text-zinc-600 mt-4">
                <span className="text-blue-400">Dati live da Meta API</span> · {meta.dateRange.from} → {meta.dateRange.to}
              </p>
            )}
          </>
        )}

        {/* ═══ SOGLIE CPL ════════════════════════════════════════════════════ */}
        {view === 'clients' && (
          <>
            <header className="flex flex-col gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold">Soglie CPL & Dettaglio Campagne</h1>
                <p className="text-zinc-400 text-sm">{clientGroups.length} clienti · {periodoLabel} · clicca su un cliente per impostare la soglia</p>
              </div>
              {periodoBar}
            </header>

            {loading && isLive && (
              <div className="mb-4 flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-300">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Recupero dati da Meta Ads...
              </div>
            )}

            <div className="space-y-2">
              {orderedGroups.map(g => {
                const isExpanded = expandedClient === g.cliente;
                const threshold = getThreshold(g.cliente);
                const status = getStatus(g);

                return (
                  <div key={g.cliente} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-4 px-6 py-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />

                      {/* Nome cliente — clicca per soglia */}
                      <button
                        className="flex-1 min-w-0 text-left group/cname"
                        onClick={() => setThresholdModal({ name: g.cliente })}
                        title="Imposta/modifica soglia CPL"
                      >
                        <p className="font-semibold group-hover/cname:text-blue-400 transition-colors flex items-center gap-1.5">
                          {g.cliente}
                          <Pencil className="w-3 h-3 text-zinc-600 group-hover/cname:text-blue-400 opacity-0 group-hover/cname:opacity-100 transition-all" />
                        </p>
                        <p className="text-xs text-zinc-500">
                          {g.cliente === 'Vyda'
                            ? `${formatNumber(g.lead)} vendite · ${formatCurrency(g.spesa)} · CPV ${formatCurrency(g.cpl)}`
                            : `${formatNumber(g.lead)} lead · ${formatCurrency(g.spesa)} · CPL ${formatCurrency(g.cpl)}`}
                          {threshold !== null
                            ? <span className="text-emerald-400"> · Soglia: {formatCurrency(threshold)}</span>
                            : <span className="text-zinc-600"> · Nessuna soglia</span>}
                        </p>
                      </button>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={status} />
                        {/* Expand campagne */}
                        <button
                          onClick={() => setExpandedClient(isExpanded ? null : g.cliente)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-100 transition-all"
                          title="Vedi campagne"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-zinc-800 overflow-hidden"
                        >
                          <div className="px-6 py-4 space-y-2">
                            <p className="text-sm font-semibold text-zinc-300 mb-3">
                              Campagne ({g.campagne.length}) · {periodoLabel}
                              <span className="text-xs font-normal text-zinc-500 ml-2">— hover per aprire in Meta</span>
                            </p>
                            {g.campagne.map((row, i) => <CampaignRow key={i} row={row} />)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══ IMPOSTAZIONI ═══════════════════════════════════════════════════ */}
        {view === 'settings' && (
          <>
            <header className="mb-8">
              <h1 className="text-2xl font-bold">Impostazioni</h1>
              <p className="text-zinc-400 text-sm">Account e configurazione</p>
            </header>
            <div className="space-y-4 max-w-lg">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-4 text-sm text-zinc-400 uppercase tracking-wider">Account</h3>
                <div className="flex items-center gap-4">
                  {user?.photoURL && <img src={user.photoURL} className="w-12 h-12 rounded-full" alt="Avatar" />}
                  <div>
                    <p className="font-semibold">{user?.displayName}</p>
                    <p className="text-sm text-zinc-400">{user?.email}</p>
                  </div>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-3 text-sm text-zinc-400 uppercase tracking-wider">Fonte dati</h3>
                <div className="text-sm text-zinc-300 space-y-2">
                  <div className="flex justify-between"><span className="text-zinc-500">Aggiornamento sheet</span><span>ogni giorno alle 02:00</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Ultimo sync</span><span className="text-xs">{sheet.lastUpdate}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Clienti attivi</span><span>{sheet.clientGroups.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Campagne (30gg)</span><span>{sheet.rows.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Soglie CPL configurate</span><span>{clients.length}</span></div>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-2 text-sm text-zinc-400 uppercase tracking-wider">Pipeline</h3>
                <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
                  <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-lg font-medium">Meta Ads API</span>
                  <span className="text-zinc-600">→</span>
                  <span className="bg-zinc-700 px-2 py-1 rounded-lg">Make.com (ogni giorno alle 02:00)</span>
                  <span className="text-zinc-600">→</span>
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-lg font-medium">Google Sheets</span>
                  <span className="text-zinc-600">→</span>
                  <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded-lg font-medium">LeadPulse</span>
                </div>
              </div>
              <button onClick={logout} className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-sm font-medium transition-all w-full justify-center">
                <LogOut className="w-4 h-4" />Disconnetti account
              </button>
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {thresholdModal && (
          <ClientModal
            clienteName={thresholdModal.name}
            firestoreClient={clients.find(c =>
              c.name.toLowerCase() === thresholdModal.name.toLowerCase() ||
              c.name.toLowerCase().includes(thresholdModal.name.toLowerCase()) ||
              thresholdModal.name.toLowerCase().includes(c.name.toLowerCase())
            )}
            onClose={() => setThresholdModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
