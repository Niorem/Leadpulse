import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Client, Campaign, DailyMetric, ClientSummary, AlertSeverity } from '../types';
import { useAuth } from '../lib/AuthContext';
import {
  Users, TrendingUp, AlertCircle, CheckCircle2, Clock, Download,
  Plus, ArrowUpRight, Search, LayoutDashboard, Settings, LogOut, X,
  ChevronDown, ChevronRight, Pencil, Trash2, BarChart2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import * as XLSX from 'xlsx';

// ─── Tipi vista ─────────────────────────────────────────────────────────────
type View = 'dashboard' | 'clients' | 'settings';

// ─── Helpers UI ──────────────────────────────────────────────────────────────
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
      status === 'OK' && 'bg-emerald-500/10 text-emerald-500',
      status === 'WARNING' && 'bg-amber-500/10 text-amber-500',
      status === 'CRITICAL' && 'bg-rose-500/10 text-rose-500'
    )}>
      {status === 'OK' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'WARNING' && <Clock className="w-3 h-3" />}
      {status === 'CRITICAL' && <AlertCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

// ─── Modal: Nuovo / Modifica Cliente ────────────────────────────────────────
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
      setError('Errore: ' + (e?.message || 'Permessi insufficienti — controlla le regole Firestore'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-xl font-bold mb-6 pr-8">{client ? 'Modifica Cliente' : 'Nuovo Cliente'}</h2>
      {error && <p className="text-rose-400 text-sm mb-4 bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <Field label="Nome cliente *">
          <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Es. Azienda SRL" />
        </Field>
        <Field label="Referente">
          <input className={inputCls} value={form.referent} onChange={e => setForm(f => ({ ...f, referent: e.target.value }))} placeholder="Mario Rossi" />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="mario@azienda.it" />
        </Field>
        <Field label="Soglia CPL (€) *">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.cplThreshold} onChange={e => setForm(f => ({ ...f, cplThreshold: e.target.value }))} placeholder="15.00" />
        </Field>
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setForm(f => ({ ...f, active: !f.active }))}
        >
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

// ─── Modal: Nuova / Modifica Campagna ───────────────────────────────────────
function CampaignModal({ campaign, clientId, onClose }: { campaign?: Campaign; clientId: string; onClose: () => void }) {
  const [form, setForm] = useState({
    campaignName: campaign?.campaignName || '',
    platform: campaign?.platform || 'Meta' as 'Meta' | 'TikTok',
    externalId: campaign?.externalId || '',
    active: campaign?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.campaignName.trim()) { setError('Il nome campagna è obbligatorio'); return; }
    setSaving(true);
    try {
      const data = {
        clientId,
        campaignName: form.campaignName.trim(),
        platform: form.platform,
        externalId: form.externalId.trim(),
        active: form.active,
      };
      if (campaign) {
        await updateDoc(doc(db, 'campaigns', campaign.id), data);
      } else {
        await addDoc(collection(db, 'campaigns'), data);
      }
      onClose();
    } catch (e: any) {
      setError('Errore: ' + (e?.message || 'Permessi insufficienti'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-xl font-bold mb-6 pr-8">{campaign ? 'Modifica Campagna' : 'Nuova Campagna'}</h2>
      {error && <p className="text-rose-400 text-sm mb-4 bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <Field label="Nome campagna *">
          <input className={inputCls} value={form.campaignName} onChange={e => setForm(f => ({ ...f, campaignName: e.target.value }))} placeholder="Es. Lead Form - Primavera 2026" />
        </Field>
        <Field label="Piattaforma">
          <div className="flex gap-2">
            {(['Meta', 'TikTok'] as const).map(p => (
              <button
                key={p}
                onClick={() => setForm(f => ({ ...f, platform: p }))}
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all',
                  form.platform === p ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100'
                )}
              >{p}</button>
            ))}
          </div>
        </Field>
        <Field label="ID esterno (opzionale)">
          <input className={inputCls} value={form.externalId} onChange={e => setForm(f => ({ ...f, externalId: e.target.value }))} placeholder="ID campagna da Meta/TikTok" />
        </Field>
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setForm(f => ({ ...f, active: !f.active }))}
        >
          <div className={cn('w-10 h-6 rounded-full transition-colors relative flex-shrink-0', form.active ? 'bg-blue-600' : 'bg-zinc-700')}>
            <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', form.active ? 'left-5' : 'left-1')} />
          </div>
          <span className="text-sm text-zinc-300">Campagna attiva</span>
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

// ─── Modal: Inserimento Metriche ─────────────────────────────────────────────
function MetricModal({ campaignId, campaignName, onClose }: { campaignId: string; campaignName: string; onClose: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState({ date: today, leads: '', spend: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const leads = parseInt(form.leads);
    const spend = parseFloat(form.spend);
    if (isNaN(leads) || leads < 0) { setError('Numero lead non valido'); return; }
    if (isNaN(spend) || spend < 0) { setError('Spesa non valida'); return; }
    setSaving(true);
    try {
      const cpl = leads > 0 ? spend / leads : 0;
      await addDoc(collection(db, 'metrics'), {
        campaignId, date: form.date,
        leads, spend, cpl,
        totalLeads: leads, totalSpend: spend,
      });
      onClose();
    } catch (e: any) {
      setError('Errore: ' + (e?.message || 'Permessi insufficienti'));
    } finally {
      setSaving(false);
    }
  };

  const leads = parseInt(form.leads) || 0;
  const spend = parseFloat(form.spend) || 0;
  const cplPreview = leads > 0 ? spend / leads : 0;

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-xl font-bold mb-1 pr-8">Inserisci Metriche</h2>
      <p className="text-zinc-400 text-sm mb-6">{campaignName}</p>
      {error && <p className="text-rose-400 text-sm mb-4 bg-rose-500/10 rounded-xl px-3 py-2">{error}</p>}
      <div className="space-y-4">
        <Field label="Data">
          <input className={inputCls} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="Lead generati">
          <input className={inputCls} type="number" min="0" value={form.leads} onChange={e => setForm(f => ({ ...f, leads: e.target.value }))} placeholder="0" />
        </Field>
        <Field label="Spesa (€)">
          <input className={inputCls} type="number" min="0" step="0.01" value={form.spend} onChange={e => setForm(f => ({ ...f, spend: e.target.value }))} placeholder="0.00" />
        </Field>
        {(leads > 0 || spend > 0) && (
          <div className="bg-zinc-800/60 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">CPL calcolato</span>
            <span className="font-mono font-bold text-blue-400">{formatCurrency(cplPreview)}</span>
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-all">Annulla</button>
        <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all disabled:opacity-50">
          {saving ? 'Salvataggio...' : 'Salva Metriche'}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Dashboard principale ────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();
  const [showCampaignModal, setShowCampaignModal] = useState<{ clientId: string; campaign?: Campaign } | null>(null);
  const [showMetricModal, setShowMetricModal] = useState<{ campaignId: string; campaignName: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubClients = onSnapshot(collection(db, 'clients'), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });
    const unsubCampaigns = onSnapshot(collection(db, 'campaigns'), snap => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign)));
    });
    const unsubMetrics = onSnapshot(collection(db, 'metrics'), snap => {
      setMetrics(snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyMetric)));
      setLoading(false);
    });
    return () => { unsubClients(); unsubCampaigns(); unsubMetrics(); };
  }, [user]);

  const getClientSummaries = (): ClientSummary[] => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return clients.map(client => {
      const clientCampaigns = campaigns.filter(c => c.clientId === client.id);
      let leadsToday = 0, spendToday = 0;
      const campaignsWithMetrics = clientCampaigns.map(campaign => {
        const m = metrics.find(m => m.campaignId === campaign.id && m.date === today);
        if (m) { leadsToday += m.leads; spendToday += m.spend; }
        return { ...campaign, metrics: m };
      });
      const cplToday = leadsToday > 0 ? spendToday / leadsToday : (spendToday > 0 ? 'N/A' : 0);
      let status: AlertSeverity = 'OK';
      if (cplToday === 'N/A') status = 'WARNING';
      else if (typeof cplToday === 'number' && cplToday > 0) {
        if (cplToday > client.cplThreshold) status = 'CRITICAL';
        else if (cplToday > client.cplThreshold * 0.8) status = 'WARNING';
      }
      return { client, leadsToday, spendToday, cplToday, status, campaigns: campaignsWithMetrics };
    });
  };

  const summaries = getClientSummaries().filter(s =>
    s.client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalLeadsToday = summaries.reduce((a, s) => a + s.leadsToday, 0);
  const totalSpendToday = summaries.reduce((a, s) => a + s.spendToday, 0);
  const avgCplToday = totalLeadsToday > 0 ? totalSpendToday / totalLeadsToday : 0;
  const criticalCount = summaries.filter(s => s.status === 'CRITICAL').length;

  const deleteClient = async (id: string) => {
    if (!confirm('Eliminare questo cliente?')) return;
    await deleteDoc(doc(db, 'clients', id));
  };
  const deleteCampaign = async (id: string) => {
    if (!confirm('Eliminare questa campagna?')) return;
    await deleteDoc(doc(db, 'campaigns', id));
  };

  const downloadExcel = () => {
    const data = summaries.flatMap(s => s.campaigns.map(c => ({
      'Cliente': s.client.name, 'Campagna': c.campaignName, 'Piattaforma': c.platform,
      'Lead Oggi': c.metrics?.leads || 0, 'Spesa Oggi (€)': c.metrics?.spend || 0,
      'CPL Oggi (€)': c.metrics?.cpl || 0, 'Soglia CPL (€)': s.client.cplThreshold, 'Stato': s.status
    })));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report Giornaliero');
    XLSX.writeFile(wb, `LeadPulse_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const navItems: { id: View; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
    { id: 'clients', icon: <Users className="w-5 h-5" />, label: 'Clienti & Campagne' },
    { id: 'settings', icon: <Settings className="w-5 h-5" />, label: 'Impostazioni' },
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

        {/* ═══ VISTA: DASHBOARD ════════════════════════════════════════════ */}
        {view === 'dashboard' && (
          <>
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold">Buongiorno, {user?.displayName?.split(' ')[0] || 'Admin'}</h1>
                <p className="text-zinc-400 text-sm">Situazione campagne — {format(new Date(), 'd MMMM yyyy', { locale: it })}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={downloadExcel} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-medium transition-all">
                  <Download className="w-4 h-4" />Esporta Excel
                </button>
                <button onClick={() => { setEditingClient(undefined); setShowClientModal(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20">
                  <Plus className="w-4 h-4" />Nuovo Cliente
                </button>
              </div>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Lead Totali Oggi', value: formatNumber(totalLeadsToday), icon: <Users className="w-5 h-5 text-blue-500" /> },
                { label: 'Spesa Totale Oggi', value: formatCurrency(totalSpendToday), icon: <TrendingUp className="w-5 h-5 text-purple-500" /> },
                { label: 'CPL Medio Oggi', value: formatCurrency(avgCplToday), icon: <BarChart2 className="w-5 h-5 text-amber-500" /> },
                { label: 'Alert Critici', value: String(criticalCount), icon: <AlertCircle className="w-5 h-5 text-rose-500" /> },
              ].map(stat => (
                <div key={stat.label} className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
                  <div className="p-2 bg-zinc-800 rounded-lg inline-block mb-3">{stat.icon}</div>
                  <p className="text-zinc-400 text-xs font-medium mb-1">{stat.label}</p>
                  <h3 className="text-2xl font-bold">{stat.value}</h3>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text" placeholder="Cerca cliente..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
              />
            </div>

            {/* Tabella */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/30">
                      {['Cliente', 'Lead Oggi', 'Spesa Oggi', 'CPL Oggi', 'Soglia', 'Stato', ''].map(h => (
                        <th key={h} className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {summaries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-zinc-500">
                            <Users className="w-10 h-10 opacity-30" />
                            <p>Nessun cliente. Inizia aggiungendone uno!</p>
                            <button onClick={() => setShowClientModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-all">
                              + Nuovo Cliente
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : summaries.map(s => (
                      <tr key={s.client.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold">{s.client.name}</div>
                          <div className="text-xs text-zinc-500">{s.client.referent}</div>
                        </td>
                        <td className="px-6 py-4 font-mono">{formatNumber(s.leadsToday)}</td>
                        <td className="px-6 py-4 font-mono">{formatCurrency(s.spendToday)}</td>
                        <td className="px-6 py-4 font-mono">
                          {s.cplToday === 'N/A' ? <span className="text-amber-500">N/A</span> : formatCurrency(s.cplToday as number)}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 font-mono">{formatCurrency(s.client.cplThreshold)}</td>
                        <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => { setView('clients'); setExpandedClient(s.client.id); }} className="p-2 text-zinc-500 hover:text-zinc-100 transition-all" title="Gestisci">
                            <ArrowUpRight className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══ VISTA: CLIENTI & CAMPAGNE ═══════════════════════════════════ */}
        {view === 'clients' && (
          <>
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold">Clienti & Campagne</h1>
                <p className="text-zinc-400 text-sm">{clients.length} clienti · {campaigns.length} campagne</p>
              </div>
              <button onClick={() => { setEditingClient(undefined); setShowClientModal(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all">
                <Plus className="w-4 h-4" />Nuovo Cliente
              </button>
            </header>

            {clients.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500 py-24">
                <Users className="w-12 h-12 opacity-20" />
                <p>Nessun cliente ancora.</p>
                <button onClick={() => setShowClientModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-all">
                  + Aggiungi il primo cliente
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map(client => {
                  const clientCampaigns = campaigns.filter(c => c.clientId === client.id);
                  const isExpanded = expandedClient === client.id;
                  return (
                    <div key={client.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                      <div
                        className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                        onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                      >
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', client.active ? 'bg-emerald-500' : 'bg-zinc-600')} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{client.name}</p>
                          <p className="text-xs text-zinc-500">{client.referent}{client.email ? ` · ${client.email}` : ''} · Soglia: {formatCurrency(client.cplThreshold)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs text-zinc-500 mr-2">{clientCampaigns.length} camp.</span>
                          <button onClick={e => { e.stopPropagation(); setEditingClient(client); setShowClientModal(true); }} className="p-1.5 text-zinc-500 hover:text-zinc-100 transition-all">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); deleteClient(client.id); }} className="p-1.5 text-zinc-500 hover:text-rose-400 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400 ml-1" /> : <ChevronRight className="w-4 h-4 text-zinc-400 ml-1" />}
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
                            <div className="px-6 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-semibold text-zinc-300">Campagne</p>
                                <button
                                  onClick={() => setShowCampaignModal({ clientId: client.id })}
                                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-all font-medium"
                                >
                                  <Plus className="w-3.5 h-3.5" />Nuova campagna
                                </button>
                              </div>
                              {clientCampaigns.length === 0 ? (
                                <p className="text-sm text-zinc-600 py-2">Nessuna campagna. Aggiungine una!</p>
                              ) : (
                                <div className="space-y-2">
                                  {clientCampaigns.map(camp => {
                                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                                    const todayMetric = metrics.find(m => m.campaignId === camp.id && m.date === todayStr);
                                    return (
                                      <div key={camp.id} className="flex items-center gap-4 bg-zinc-800/50 rounded-xl px-4 py-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                                              camp.platform === 'Meta' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'
                                            )}>
                                              {camp.platform}
                                            </span>
                                            <span className="text-sm font-medium">{camp.campaignName}</span>
                                            {!camp.active && <span className="text-xs text-zinc-600">(inattiva)</span>}
                                          </div>
                                          {todayMetric ? (
                                            <p className="text-xs text-zinc-500 mt-1">
                                              Oggi: {todayMetric.leads} lead · {formatCurrency(todayMetric.spend)} · CPL {formatCurrency(todayMetric.cpl)}
                                            </p>
                                          ) : (
                                            <p className="text-xs text-zinc-600 mt-1">Nessuna metrica per oggi</p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <button
                                            onClick={() => setShowMetricModal({ campaignId: camp.id, campaignName: camp.campaignName })}
                                            className="px-2.5 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-all font-medium whitespace-nowrap"
                                          >
                                            + Metriche
                                          </button>
                                          <button onClick={() => setShowCampaignModal({ clientId: client.id, campaign: camp })} className="p-1.5 text-zinc-500 hover:text-zinc-100 transition-all">
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button onClick={() => deleteCampaign(camp.id)} className="p-1.5 text-zinc-500 hover:text-rose-400 transition-all">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
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

        {/* ═══ VISTA: IMPOSTAZIONI ═════════════════════════════════════════ */}
        {view === 'settings' && (
          <>
            <header className="mb-8">
              <h1 className="text-2xl font-bold">Impostazioni</h1>
              <p className="text-zinc-400 text-sm">Account e statistiche progetto</p>
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
                <h3 className="font-semibold mb-3 text-sm text-zinc-400 uppercase tracking-wider">Statistiche</h3>
                <div className="text-sm text-zinc-300 space-y-2">
                  <div className="flex justify-between"><span className="text-zinc-500">Clienti</span><span>{clients.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Campagne</span><span>{campaigns.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Record metriche</span><span>{metrics.length}</span></div>
                </div>
              </div>
              <button onClick={logout} className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-sm font-medium transition-all w-full justify-center">
                <LogOut className="w-4 h-4" />Disconnetti account
              </button>
            </div>
          </>
        )}
      </main>

      {/* ═══ MODALI ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showClientModal && (
          <ClientModal
            client={editingClient}
            onClose={() => { setShowClientModal(false); setEditingClient(undefined); }}
          />
        )}
        {showCampaignModal && (
          <CampaignModal
            clientId={showCampaignModal.clientId}
            campaign={showCampaignModal.campaign}
            onClose={() => setShowCampaignModal(null)}
          />
        )}
        {showMetricModal && (
          <MetricModal
            campaignId={showMetricModal.campaignId}
            campaignName={showMetricModal.campaignName}
            onClose={() => setShowMetricModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
