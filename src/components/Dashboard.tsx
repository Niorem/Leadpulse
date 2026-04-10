import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Client, Campaign, DailyMetric, ClientSummary, AlertSeverity } from '../types';
import { useAuth } from '../lib/AuthContext';
import { 
  Users, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Filter, 
  Download,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  LayoutDashboard,
  Settings,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatNumber, cn } from '../lib/utils';
import { format, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user) return;

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    });

    const unsubCampaigns = onSnapshot(collection(db, 'campaigns'), (snapshot) => {
      setCampaigns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign)));
    });

    const unsubMetrics = onSnapshot(collection(db, 'metrics'), (snapshot) => {
      setMetrics(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyMetric)));
      setLoading(false);
    });

    return () => {
      unsubClients();
      unsubCampaigns();
      unsubMetrics();
    };
  }, [user]);

  const getClientSummaries = (): ClientSummary[] => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    return clients.map(client => {
      const clientCampaigns = campaigns.filter(c => c.clientId === client.id);
      let leadsToday = 0;
      let spendToday = 0;

      const campaignsWithMetrics = clientCampaigns.map(campaign => {
        const campaignMetrics = metrics.find(m => m.campaignId === campaign.id && m.date === today);
        if (campaignMetrics) {
          leadsToday += campaignMetrics.leads;
          spendToday += campaignMetrics.spend;
        }
        return { ...campaign, metrics: campaignMetrics };
      });

      const cplToday = leadsToday > 0 ? spendToday / leadsToday : (spendToday > 0 ? 'N/A' : 0);
      
      let status: AlertSeverity = 'OK';
      if (cplToday === 'N/A') {
        status = 'WARNING';
      } else if (typeof cplToday === 'number' && cplToday > 0) {
        if (cplToday > client.cplThreshold) {
          status = 'CRITICAL';
        } else if (cplToday > client.cplThreshold * 0.8) {
          status = 'WARNING';
        }
      }

      return {
        client,
        leadsToday,
        spendToday,
        cplToday,
        status,
        campaigns: campaignsWithMetrics
      };
    });
  };

  const summaries = getClientSummaries().filter(s => 
    s.client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalLeadsToday = summaries.reduce((acc, s) => acc + s.leadsToday, 0);
  const totalSpendToday = summaries.reduce((acc, s) => acc + s.spendToday, 0);
  const avgCplToday = totalLeadsToday > 0 ? totalSpendToday / totalLeadsToday : 0;

  const downloadExcel = () => {
    const data = summaries.flatMap(s => s.campaigns.map(c => ({
      'Cliente': s.client.name,
      'Campagna': c.campaignName,
      'Piattaforma': c.platform,
      'Lead Oggi': c.metrics?.leads || 0,
      'Spesa Oggi (€)': c.metrics?.spend || 0,
      'CPL Oggi (€)': c.metrics?.cpl || 0,
      'Soglia CPL (€)': s.client.cplThreshold,
      'Stato': s.status
    })));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report Giornaliero");
    XLSX.writeFile(wb, `LeadPulse_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 border-r border-zinc-800 hidden lg:flex flex-col p-6 z-20">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">LeadPulse</span>
        </div>

        <nav className="flex-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600/10 text-blue-500 rounded-xl font-medium transition-all">
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 rounded-xl font-medium transition-all">
            <Users className="w-5 h-5" />
            Clienti
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 rounded-xl font-medium transition-all">
            <Settings className="w-5 h-5" />
            Impostazioni
          </button>
        </nav>

        <div className="pt-6 border-t border-zinc-800">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-red-400 transition-all font-medium"
          >
            <LogOut className="w-5 h-5" />
            Esci
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Buongiorno, {user?.displayName?.split(' ')[0]}</h1>
            <p className="text-zinc-400 text-sm">Ecco la situazione delle campagne di oggi, {format(new Date(), 'd MMMM yyyy', { locale: it })}</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={downloadExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Esporta Excel
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20">
              <Plus className="w-4 h-4" />
              Nuovo Cliente
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">+12%</span>
            </div>
            <p className="text-zinc-400 text-sm font-medium mb-1">Lead Totali Oggi</p>
            <h3 className="text-3xl font-bold">{formatNumber(totalLeadsToday)}</h3>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <span className="text-xs font-medium text-zinc-500 bg-zinc-500/10 px-2 py-1 rounded-full">Stabile</span>
            </div>
            <p className="text-zinc-400 text-sm font-medium mb-1">Spesa Totale Oggi</p>
            <h3 className="text-3xl font-bold">{formatCurrency(totalSpendToday)}</h3>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <span className="text-xs font-medium text-rose-500 bg-rose-500/10 px-2 py-1 rounded-full">+5%</span>
            </div>
            <p className="text-zinc-400 text-sm font-medium mb-1">CPL Medio Oggi</p>
            <h3 className="text-3xl font-bold">{formatCurrency(avgCplToday)}</h3>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Cerca cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
            />
          </div>
          <button className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-zinc-100 transition-all">
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Clients Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/30">
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lead Oggi</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Spesa Oggi</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">CPL Oggi</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Soglia</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Stato</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                      Nessun cliente trovato. Inizia aggiungendone uno!
                    </td>
                  </tr>
                ) : (
                  summaries.map((summary) => (
                    <tr key={summary.client.id} className="hover:bg-zinc-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold">{summary.client.name}</div>
                        <div className="text-xs text-zinc-500">{summary.client.referent}</div>
                      </td>
                      <td className="px-6 py-4 font-mono">{formatNumber(summary.leadsToday)}</td>
                      <td className="px-6 py-4 font-mono">{formatCurrency(summary.spendToday)}</td>
                      <td className="px-6 py-4 font-mono">
                        {summary.cplToday === 'N/A' ? (
                          <span className="text-amber-500">N/A</span>
                        ) : (
                          formatCurrency(summary.cplToday as number)
                        )}
                      </td>
                      <td className="px-6 py-4 text-zinc-400 font-mono">{formatCurrency(summary.client.cplThreshold)}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                          summary.status === 'OK' && "bg-emerald-500/10 text-emerald-500",
                          summary.status === 'WARNING' && "bg-amber-500/10 text-amber-500",
                          summary.status === 'CRITICAL' && "bg-rose-500/10 text-rose-500"
                        )}>
                          {summary.status === 'OK' && <CheckCircle2 className="w-3 h-3" />}
                          {summary.status === 'WARNING' && <Clock className="w-3 h-3" />}
                          {summary.status === 'CRITICAL' && <AlertCircle className="w-3 h-3" />}
                          {summary.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-zinc-500 hover:text-zinc-100 transition-all">
                          <ArrowUpRight className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
