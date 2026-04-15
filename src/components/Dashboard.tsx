import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Client, Campaign } from '../types';
import { useAuth } from '../lib/AuthContext';
import { useSheetData, ClientGroup, SheetRow } from '../lib/useSheetData';
import {
  Users, TrendingUp, AlertCircle, CheckCircle2, Clock, Download,
  Plus, ArrowUpRight, Search, LayoutDashboard, Settings, LogOut, X,
  ChevronDown, ChevronRight, Pencil, Trash2, BarChart2, RefreshCw, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import * as XLSX from 'xlsx';

type View = 'dashboard' | 'clients' | 'settings';
type AlertSeverity = 'OK' | 'WARNING' | 'CRITICAL';

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

// ─── Modal: Nuovo / Modifica Cliente ─────────────────────────────────────────
function ClientModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const [form, setForm] = useState({
    name: client?.name || '',
    referent: client?.referent || '',
    email: client?.email || '',
    cplThreshold: client?.cplThreshold?.toString() || '',
    active: client?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.name.trim()) { setError('Il nome cliente è obbligatorio'); return; }
    if (!form.cplThreshold || isNaN(Number(form.cplThreshold))) { setError('Soglia CPL non valida'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        referent: form.referent.trim(),
        email: form.email.trim(),
        cplThreshold: parseFloat(form.cplThreshold),
        active: form.active,
      };
      if (client) {
        await updateDoc(doc(db, 'clients', client.id), data);
      } else {
        await addDoc(collection(db, 'clients'), data);
      }
      onClose();
    } catch (e: any) {
      setError('Errore: ' + (e?.message || 'Controlla le regole Firestore'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-xl font-bold mb-6 pr-8">{client ? 'Modifica Cliente' : 'Nuovo Cliente'}</h2>
      <p className="text-zinc-400 text-sm mb-5">
        Il nome cliente deve corrispondere esattamente alla colonna "Cliente" nel Google Sheet (es. "PAA", "FCC").
      </p>
      {error && <p className="text-rose-400 text-sm mb-4 bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <Field label="Nome cliente * (deve coincidere con il sheet)">
          <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Es. PAA, FCC, SVD..." />
        </Field>
        <Field label="Referente">
          <input className={inputCls} value={form.referent} onChange={e => setForm(f => ({ ...f, referent: e.target.value }))} placeholder="Mario Rossi" />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="mario@azienda.it" />
        </Field>
        <Field label="Soglia CPL (€) *">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.cplThreshold}
            onChange={e => setForm(f => ({ ...f, cplThreshold: e.target.value }))} placeholder="15.00" />
        </Field>
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
          <div className={cn('w-10 h-6 rounded-full transition-colors relative flex-shrink-0', form.active ? 'bg-blue-600' : 'bg-zinc-700')}>
            <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', form.active ? 'left-5' : 'left-1')} />
          </div>
          <span className="text-sm text-zinc-300">Cliente attivo</span>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-all">Annulla</button>
        <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all disabled:opacity-50">
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Card campagna (dettaglio) ────────────────────────────────────────────────
function CampaignRow({ row }: { row: SheetRow }) {
  const leads = row.lead;
  const cpl   = row.cpl;
  return (
    <div className="flex items-center gap-4 bg-zinc-800/50 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Meta</span>
          <span className="text-sm font-medium truncate">{row.campagna}</span>
          {row.stato && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{row.stato}</span>}
        </div>
        <p className="text-xs text-zinc-500 mt-1 font-mono">
          {formatNumber(leads)} lead · {formatCurrency(row.spesa)} · CPL {formatCurrency(cpl)}
          {row.dataDa ? ` · ${row.dataDa} → ${row.dataA}` : ''}
        </p>
      </div>
      <div className="text-right text-xs text-zinc-600 flex-shrink-0">
        <div>{formatNumber(row.impressioni)} impr.</div>
        <div>{formatNumber(row.click)} click</div>
      </div>
    </div>
  );
}

// ─── Dashboard principale ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();

  // Firestore: clienti (per soglie CPL)
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState(true);

  // Google Sheets: dati Meta Ads automatici
  const { rows, clientGroups, lastUpdate, dateRange, loading: sheetLoading, error: sheetError, refresh } = useSheetData();

  const [view, setView] = useState<View>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();

  useEffect(() => {
    if (!user) return;
    const unsubClients = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });
    const unsubCampaigns = onSnapshot(collection(db, 'campaigns'), snap => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign)));
      setFirestoreLoading(false);
    });
    return () => { unsubClients(); unsubCampaigns(); };
  }, [user]);

  // Helper: trova soglia CPL da Firestore per un nome cliente (match parziale)
  const getThreshold = (clienteName: string): number | null => {
    const match = clients.find(c =>
      c.name.toLowerCase() === clienteName.toLowerCase() ||
      c.name.toLowerCase().includes(clienteName.toLowerCase()) ||
      clienteName.toLowerCase().includes(c.name.toLowerCase())
    );
    return match ? match.cplThreshold : null;
  };

  // Calcola status CPL per un gruppo cliente
  const getStatus = (group: ClientGroup): AlertSeverity => {
    const threshold = getThreshold(group.cliente);
    if (threshold === null || group.cpl === 0) return 'OK';
    if (group.cpl > threshold) return 'CRITICAL';
    if (group.cpl > threshold * 0.8) return 'WARNING';
    return 'OK';
  };

  // Statistiche aggregate
  const totalLeads     = clientGroups.reduce((s, g) => s + g.lead, 0);
  const totalSpend     = clientGroups.reduce((s, g) => s + g.spesa, 0);
  const totalCPL       = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const criticalCount  = clientGroups.filter(g => getStatus(g) === 'CRITICAL').length;
  const totalImpressioni = rows.reduce((s, r) => s + r.impressioni, 0);

  // Filtra per ricerca
  const filteredGroups = clientGroups.filter(g =>
    g.cliente.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const deleteClient = async (id: string) => {
    if (!confirm('Eliminare questo cliente?')) return;
    await deleteDoc(doc(db, 'clients', id));
  };

  const downloadExcel = () => {
    const data = rows.map(r => ({
      'Campagna': r.campagna, 'Cliente': r.cliente,
      'Lead (30gg)': r.lead, 'Spesa € (30gg)': r.spesa, 'CPL €': r.cpl,
      'Impressioni': r.impressioni, 'Click': r.click,
      'CPM €': r.cpm, 'CPC €': r.cpc,
      'Dal': r.dataDa, 'Al': r.dataA, 'Stato': r.stato,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Meta Ads 30gg');
    XLSX.writeFile(wb, `LeadPulse_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const loading = firestoreLoading || sheetLoading;

  if (loading && clientGroups.length === 0) {
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
          <span className="text-xl font-bold tracking-tight">LeadPulse</span>
        </div>

        {/* Badge aggiornamento automatico */}
        <div className="mb-6 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-emerald-400">Auto · ogni ora</span>
          </div>
          {lastUpdate && <p className="text-xs text-zinc-500 leading-tight">Ultimo sync: {lastUpdate}</p>}
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
        {/* Header mobile */}
        <div className="flex items-center gap-4 mb-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 bg-zinc-800 rounded-xl">
            <LayoutDashboard className="w-5 h-5" />
          </button>
          <span className="font-bold text-lg">LeadPulse</span>
        </div>

        {/* ═══ DASHBOARD ════════════════════════════════════════════════════ */}
        {view === 'dashboard' && (
          <>
            <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold">
                  Buongiorno, {user?.displayName?.split(' ')[0] || 'Admin'} 👋
                </h1>
                <p className="text-zinc-400 text-sm mt-1">
                  Campagne Meta Ads — {format(new Date(), 'd MMMM yyyy', { locale: it })}
                  {dateRange.from && (
                    <span className="ml-2 text-zinc-600">· periodo {dateRange.from} → {dateRange.to}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Badge auto */}
                <span className="hidden md:flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Dati automatici da Meta Ads
                </span>
                <button
                  onClick={refresh}
                  className="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-xl transition-all"
                  title="Aggiorna ora"
                >
                  <RefreshCw className={cn("w-4 h-4", sheetLoading && "animate-spin text-blue-400")} />
                </button>
                <button onClick={downloadExcel} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-medium transition-all">
                  <Download className="w-4 h-4" />Excel
                </button>
              </div>
            </header>

            {/* Errore sheet */}
            {sheetError && (
              <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-sm">
                <p className="font-semibold text-rose-400 mb-1">⚠️ Google Sheet non accessibile</p>
                <p className="text-zinc-400 text-xs">
                  {sheetError}. Assicurati che il foglio sia condiviso come "Chiunque abbia il link può visualizzare".
                </p>
              </div>
            )}

            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              {[
                { label: 'Lead Totali (30gg)', value: formatNumber(totalLeads),   icon: <Users className="w-5 h-5 text-blue-500" /> },
                { label: 'Spesa Totale (30gg)', value: formatCurrency(totalSpend), icon: <TrendingUp className="w-5 h-5 text-purple-500" /> },
                { label: 'CPL Medio (30gg)',    value: formatCurrency(totalCPL),   icon: <BarChart2 className="w-5 h-5 text-amber-500" /> },
                { label: 'Clienti Attivi',      value: String(clientGroups.length), icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
                { label: 'Alert Critici',        value: String(criticalCount),       icon: <AlertCircle className="w-5 h-5 text-rose-500" /> },
              ].map(stat => (
                <div key={stat.label} className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
                  <div className="p-2 bg-zinc-800 rounded-lg inline-block mb-3">{stat.icon}</div>
                  <p className="text-zinc-400 text-xs font-medium mb-1">{stat.label}</p>
                  <h3 className="text-2xl font-bold">{stat.value}</h3>
                </div>
              ))}
            </div>

            {/* Ricerca */}
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text" placeholder="Cerca cliente..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
              />
            </div>

            {/* Tabella clienti (da Google Sheets) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/30">
                      {['Cliente', 'Lead (30gg)', 'Spesa (30gg)', 'CPL', 'Soglia', 'Stato', ''].map(h => (
                        <th key={h} className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filteredGroups.length === 0 && !sheetLoading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-zinc-500">
                            <TrendingUp className="w-10 h-10 opacity-30" />
                            <p>
                              {sheetError
                                ? 'Errore nel caricare i dati. Verifica che il foglio sia accessibile.'
                                : 'Nessun dato. Make.com caricherà le campagne alla prossima esecuzione.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredGroups.map(g => {
                      const threshold = getThreshold(g.cliente);
                      const status = getStatus(g);
                      return (
                        <tr key={g.cliente} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold">{g.cliente}</div>
                            <div className="text-xs text-zinc-500">{g.campagne.length} campagne</div>
                          </td>
                          <td className="px-6 py-4 font-mono">{formatNumber(g.lead)}</td>
                          <td className="px-6 py-4 font-mono">{formatCurrency(g.spesa)}</td>
                          <td className="px-6 py-4 font-mono font-semibold">{formatCurrency(g.cpl)}</td>
                          <td className="px-6 py-4 text-zinc-400 font-mono">
                            {threshold !== null ? formatCurrency(threshold) : <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={status} /></td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => { setView('clients'); setExpandedClient(g.cliente); }}
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

            {/* Footer fonte dati */}
            {lastUpdate && (
              <p className="text-center text-xs text-zinc-600 mt-4">
                Dati da Meta Ads via Make.com · Aggiornati automaticamente ogni ora · Ultimo sync: {lastUpdate}
              </p>
            )}
          </>
        )}

        {/* ═══ SOGLIE CPL (ex Clienti & Campagne) ════════════════════════════ */}
        {view === 'clients' && (
          <>
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold">Soglie CPL & Dettaglio Campagne</h1>
                <p className="text-zinc-400 text-sm">
                  {clientGroups.length} clienti attivi · Imposta le soglie CPL per gli alert
                </p>
              </div>
              <button
                onClick={() => { setEditingClient(undefined); setShowClientModal(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" />Soglia CPL
              </button>
            </header>

            {clientGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500 py-24">
                <TrendingUp className="w-12 h-12 opacity-20" />
                <p>Nessun dato ancora. Make.com aggiungerà le campagne automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {clientGroups
                  .filter(g => !searchTerm || g.cliente.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(g => {
                    const isExpanded = expandedClient === g.cliente;
                    const threshold = getThreshold(g.cliente);
                    const status = getStatus(g);
                    const firestoreClient = clients.find(c =>
                      c.name.toLowerCase() === g.cliente.toLowerCase() ||
                      c.name.toLowerCase().includes(g.cliente.toLowerCase())
                    );

                    return (
                      <div key={g.cliente} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                        <div
                          className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                          onClick={() => setExpandedClient(isExpanded ? null : g.cliente)}
                        >
                          <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold">{g.cliente}</p>
                            <p className="text-xs text-zinc-500">
                              {formatNumber(g.lead)} lead · {formatCurrency(g.spesa)} · CPL {formatCurrency(g.cpl)}
                              {threshold !== null ? ` · Soglia: ${formatCurrency(threshold)}` : ' · Nessuna soglia impostata'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <StatusBadge status={status} />
                            {firestoreClient && (
                              <button
                                onClick={e => { e.stopPropagation(); setEditingClient(firestoreClient); setShowClientModal(true); }}
                                className="p-1.5 text-zinc-500 hover:text-zinc-100 transition-all"
                                title="Modifica soglia"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {!firestoreClient && (
                              <button
                                onClick={e => { e.stopPropagation(); setEditingClient(undefined); setShowClientModal(true); }}
                                className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 rounded-lg transition-all"
                                title="Imposta soglia CPL"
                              >
                                + Soglia
                              </button>
                            )}
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-zinc-400" />
                              : <ChevronRight className="w-4 h-4 text-zinc-400" />
                            }
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
                                  Campagne ({g.campagne.length}) · ultimi 30 giorni
                                </p>
                                {g.campagne.map((row, i) => (
                                  <CampaignRow key={i} row={row} />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </div>
            )}
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
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Piattaforma</span>
                    <span className="text-emerald-400 font-medium">Meta Ads (automatico)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Aggiornamento</span>
                    <span>Ogni ora</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Clienti nel sheet</span>
                    <span>{clientGroups.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Campagne nel sheet</span>
                    <span>{rows.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Soglie CPL configurate</span>
                    <span>{clients.length}</span>
                  </div>
                  {lastUpdate && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Ultimo sync</span>
                      <span className="text-xs">{lastUpdate}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-2 text-sm text-zinc-400 uppercase tracking-wider">Pipeline</h3>
                <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
                  <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-lg font-medium">Meta Ads API</span>
                  <span className="text-zinc-600">→</span>
                  <span className="bg-zinc-700 px-2 py-1 rounded-lg">Make.com (ogni ora)</span>
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

      {/* ═══ MODALI ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showClientModal && (
          <ClientModal
            client={editingClient}
            onClose={() => { setShowClientModal(false); setEditingClient(undefined); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
