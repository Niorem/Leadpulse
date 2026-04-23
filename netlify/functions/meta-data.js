// Netlify Function: chiama Meta API on-demand con date personalizzate
// Parametri query: preset=yesterday|today|last_7d oppure from=YYYY-MM-DD&to=YYYY-MM-DD

const TOKEN = 'EAAJCfiazRLABRK9ABu1Xu6meZBsMoy1YuiGAZBuZA5liIzSEVfjt51new9ooXn5908WYBbRa2BCZCGwtsGBKIT4kydZC4owFzdsDjGrBQ14KZBlRzhXJX2R1cvyVJcQAzWOFcKhzn1tyhBj2OSz14zE4kYNJCIafOgKshlF9TdZBwEN6kpKXQWPP9U0kDumq1cpAAZDZD';

const ACCOUNTS = [
  { id: 'act_345910273',          name: 'Galullo' },
  { id: 'act_1521048745714275',   name: 'Vyda' },
  { id: 'act_1348353952726075',   name: 'SVD' },
  { id: 'act_37738653',           name: 'FCC' },
  { id: 'act_728778909246899',    name: 'PMF' },
  { id: 'act_378472188256400',    name: 'Bar Nol' },
  { id: 'act_369452318493607',    name: 'PAR' },
  { id: 'act_1285703325167443',   name: 'PAA' },           // fix: era 12857033325167443
  { id: 'act_1431982563684605',   name: 'Dott Sante Vass' }, // fix: era 1431982563684600
  { id: 'act_777606880847637',    name: 'Part Exp' },      // fix: Partenope Experience
  { id: 'act_10282929749335585',  name: 'RR' },
  { id: 'act_1357284689000232',   name: 'Asd Sp' },
  { id: 'act_135241018772815',    name: 'Cesena Sub' },    // nuovo
];

export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  const { preset, from, to } = event.queryStringParameters || {};

  if (!preset && (!from || !to)) {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ error: 'Parametri mancanti: usa preset=yesterday oppure from=YYYY-MM-DD&to=YYYY-MM-DD' }),
    };
  }

  const results = [];

  await Promise.all(ACCOUNTS.map(async (account) => {
    try {
      const params = new URLSearchParams({
        fields: 'campaign_id,campaign_name,spend,actions,impressions,clicks,cpm,cpc,date_start,date_stop',
        level: 'campaign',
        limit: '500',
        access_token: TOKEN,
      });

      if (preset) {
        params.set('date_preset', preset);
      } else {
        params.set('time_range', JSON.stringify({ since: from, until: to }));
      }

      // Paginazione: segui paging.next finché ci sono risultati
      let url = `https://graph.facebook.com/v21.0/${account.id}/insights?${params}`;
      while (url) {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.data) break; // 403 o account senza dati

        for (const c of data.data) {
          const isVyda = account.name === 'Vyda';
          const leadVal = c.actions?.find(a => a.action_type === 'lead')?.value;
          // Vyda: solo offsite_conversion.fb_pixel_purchase = "Acquisti sul sito web"
          // NON sommare più tipi: si sovrappongono e causano doppio conteggio
          const purchaseVal = isVyda
            ? parseFloat(c.actions?.find(a => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value) || 0
            : null;
          const lead = isVyda ? purchaseVal : (parseFloat(leadVal) || 0);
          const spesa = parseFloat(c.spend) || 0;
          results.push({
            campagna:    c.campaign_name || '',
            cliente:     account.name,
            lead,
            spesa,
            cpl:         lead > 0 ? spesa / lead : 0,
            impressioni: parseFloat(c.impressions) || 0,
            click:       parseFloat(c.clicks) || 0,
            cpm:         parseFloat(c.cpm) || 0,
            cpc:         parseFloat(c.cpc) || 0,
            dataDa:      c.date_start || from || '',
            dataA:       c.date_stop  || to   || '',
            stato:       'Attiva',
            campaignId:  c.campaign_id || '',
            accountId:   account.id,
            periodo:     preset || 'custom',
          });
        }

        // Pagina successiva (se presente)
        url = data.paging?.next || null;
      }
    } catch (_) {
      // account non accessibile, skip silenzioso
    }
  }));

  // Ordina per cliente, poi per lead decrescente
  results.sort((a, b) => a.cliente.localeCompare(b.cliente) || b.lead - a.lead);

  return {
    statusCode: 200,
    headers: { ...cors, 'Cache-Control': 'no-store' },
    body: JSON.stringify(results),
  };
};
