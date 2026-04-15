// Netlify Function: proxy Google Sheets CSV
// Evita CORS e non richiede che il foglio sia pubblico se l'utente è loggato
// (il foglio deve essere almeno "chiunque abbia il link può visualizzare")

export const handler = async () => {
  const SHEET_ID = '16U-z_TejszKx3ZdEolStCxxWzBoQFpwyYrNG9Mjo5f4';
  const SHEET_NAME = 'DATI_CAMPAGNE';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&t=${Date.now()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Sheet non accessibile (HTTP ${res.status}). Assicurati che il foglio sia condiviso come "Chiunque abbia il link può visualizzare".`);
    }
    const csv = await res.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120', // 2 minuti di cache
      },
      body: csv,
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
