// Netlify Function: proxy Google Sheets CSV
// Filtra solo il batch più recente per restare sotto il limite 6MB di Netlify

export const handler = async () => {
  const SHEET_ID = '16U-z_TejszKx3ZdEolStCxxWzBoQFpwyYrNG9Mjo5f4';
  const SHEET_NAME = 'DATI_CAMPAGNE';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&t=${Date.now()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Sheet non accessibile (HTTP ${res.status}).`);
    }
    const csv = await res.text();
    const lines = csv.split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

    // Trova il timestamp più recente nella colonna UltimoAgg (indice 12)
    // Formato atteso: DD/MM/YYYY HH:00  — non contiene virgole, ricerca sicura
    const tsRegex = /\d{2}\/\d{2}\/\d{4} \d{2}:00/;
    const parseTs = (ts) => {
      const m = ts.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
      if (!m) return 0;
      return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
    };

    // Raccoglie tutti i timestamp validi e trova il più recente
    const tsSet = new Set();
    for (const line of dataLines) {
      const match = line.match(tsRegex);
      if (match) tsSet.add(match[0]);
    }
    const sortedTs = [...tsSet].sort((a, b) => parseTs(b) - parseTs(a));
    const latestTs = sortedTs[0];

    // Se non ci sono timestamp validi, restituisce tutte le righe (max 3000 per sicurezza)
    let filtered;
    if (latestTs) {
      filtered = dataLines.filter(l => l.includes(latestTs));
    } else {
      filtered = dataLines.slice(-3000);
    }

    const body = [header, ...filtered].join('\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
        'X-Rows-Total': String(dataLines.length),
        'X-Rows-Filtered': String(filtered.length),
        'X-Latest-Ts': latestTs || 'none',
      },
      body,
    };
  } catch (e) {
    console.error('[sheets-data] Errore:', e.message);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
