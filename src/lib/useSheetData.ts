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

export function useSheetData(): UseSheetDataResult {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
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
      const data: SheetRow[] = parsed.slice(1)
        .map(r => ({
          campagna:   (r[0] || '').trim(),
          cliente:    (r[1] || '').trim(),
          lead:       parseFloat(r[2]) || 0,
          spesa:      parseFloat(r[3]) || 0,
          cpl:        parseFloat(r[4]) || 0,
          impressioni: parseFloat(r[5]) || 0,
          click:      parseFloat(r[6]) || 0,
          cpm:        parseFloat(r[7]) || 0,
          cpc:        parseFloat(r[8]) || 0,
          dataDa:     (r[9]  || '').trim(),
          dataA:      (r[10] || '').trim(),
          stato:      (r[11] || '').trim(),
          ultimoAgg:  (r[12] || '').trim(),
        }))
        .filter(r => r.campagna || r.cliente);

      if (data.length === 0) throw new Error('Nessuna campagna trovata nel foglio');

      // Trova il batch più recente (per UltimoAgg)
      const timestamps = [...new Set(data.map(r => r.ultimoAgg).filter(Boolean))].sort().reverse();
      const latestTs = timestamps[0] || '';
      const latest = latestTs ? data.filter(r => r.ultimoAgg === latestTs) : data;

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
      setLastUpdate(latestTs);
      setDateRange({ from: dates[0] || '', to: datesEnd[0] || '' });
    } catch (e: any) {
      setError(e.message || 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3600_000); // refresh ogni ora
    return () => clearInterval(interval);
  }, [load]);

  return { rows, clientGroups, lastUpdate, dateRange, loading, error, refresh: load };
}
