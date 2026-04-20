import { useState, useEffect, useCallback } from 'react';

// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface SheetRow {
  campagna: string;
  cliente: string;
  lead: number;
  spesa: number;
  cpl: number;
  impressioni: number;
  click: number;
  cpm: number;
  cpc: number;
  dataDa: string;
  dataA: string;
  stato: string;
  ultimoAgg: string;
  campaignId: string;
  accountId: string;
  periodo: string;
}

export interface ClientGroup {
  cliente: string;
  lead: number;
  spesa: number;
  cpl: number;
  impressioni: number;
  click: number;
  campagne: SheetRow[];
}

export interface UseSheetDataResult {
  rows: SheetRow[];
  clientGroups: ClientGroup[];
  lastUpdate: string;
  dateRange: { from: string; to: string };
  availablePeriods: string[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ─── CSV Parser (gestisce campi quotati e virgole interne) ────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (row.some(c => c !== '')) rows.push(row);
  }
  return rows;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSheetData(selectedPeriodo: string = 'mensile'): UseSheetDataResult {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [availablePeriods, setAvailablePeriods] = useState<string[]>(['mensile']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sheets-data');
      if (!res.ok) throw new Error(`Errore HTTP ${res.status}`);

      const text = await res.text();
      const parsed = parseCSV(text);

      if (parsed.length < 2) throw new Error('Foglio vuoto o non accessibile');

      // Salta la riga header, mappa le righe
      const allData: SheetRow[] = parsed.slice(1)
        .map(r => ({
          campagna:    (r[0]  || '').trim(),
          cliente:     (r[1]  || '').trim(),
          lead:        parseFloat(r[2]) || 0,
          spesa:       parseFloat(r[3]) || 0,
          cpl:         parseFloat(r[4]) || 0,
          impressioni: parseFloat(r[5]) || 0,
          click:       parseFloat(r[6]) || 0,
          cpm:         parseFloat(r[7]) || 0,
          cpc:         parseFloat(r[8]) || 0,
          dataDa:      (r[9]  || '').trim(),
          dataA:       (r[10] || '').trim(),
          stato:       (r[11] || '').trim(),
          ultimoAgg:   (r[12] || '').trim(),
          campaignId:  (r[13] || '').trim(),
          accountId:   (r[14] || '').trim(),
          periodo:     ((r[15] || '').trim()) || 'mensile',
        }))
        .filter(r => r.campagna || r.cliente);

      if (allData.length === 0) throw new Error('Nessuna campagna trovata nel foglio');

      // Periodi disponibili
      const periods = [...new Set(allData.map(r => r.periodo).filter(Boolean))];
      setAvailablePeriods(periods.length > 0 ? periods : ['mensile']);

      // Filtra per periodo selezionato
      const periodData = allData.filter(r =>
        r.periodo === selectedPeriodo || (!r.periodo && selectedPeriodo === 'mensile')
      );

      // Trova il batch più recente per UltimoAgg — accetta solo DD/MM/YYYY HH:mm
      const tsRegex = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/;
      const parseTs = (ts: string): number => {
        const m = ts.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
        if (!m) return 0;
        return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
      };
      const validTimestamps = [...new Set(periodData.map(r => r.ultimoAgg).filter(ts => tsRegex.test(ts)))]
        .sort((a, b) => parseTs(b) - parseTs(a));
      const latestTs = validTimestamps[0] || '';
      const fallbackTs = [...new Set(periodData.map(r => r.ultimoAgg).filter(Boolean))].sort().reverse()[0] || '';
      const activeTs = latestTs || fallbackTs;
      const latest = activeTs ? periodData.filter(r => r.ultimoAgg === activeTs) : periodData;

      // Range date
      const dates    = latest.map(r => r.dataDa).filter(Boolean).sort();
      const datesEnd = latest.map(r => r.dataA).filter(Boolean).sort().reverse();

      // Raggruppa per cliente
      const groupMap = new Map<string, ClientGroup>();
      for (const row of latest) {
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

      // Calcola CPL aggregato per cliente
      const groups: ClientGroup[] = [...groupMap.values()].map(g => ({
        ...g,
        cpl: g.lead > 0 ? g.spesa / g.lead : 0,
      })).sort((a, b) => b.lead - a.lead);

      setRows(latest);
      setClientGroups(groups);
      setLastUpdate(activeTs);
      setDateRange({ from: dates[0] || '', to: datesEnd[0] || '' });
    } catch (e: any) {
      setError(e.message || 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodo]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3600_000);
    return () => clearInterval(interval);
  }, [load]);

  return { rows, clientGroups, lastUpdate, dateRange, availablePeriods, loading, error, refresh: load };
}
