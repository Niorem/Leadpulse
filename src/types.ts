export interface Client {
  id: string;
  name: string;
  referent: string;
  email: string;
  cplThreshold: number;
  active: boolean;
}

export interface Campaign {
  id: string;
  clientId: string;
  platform: 'Meta' | 'TikTok';
  campaignName: string;
  externalId: string;
  active: boolean;
}

export interface DailyMetric {
  id: string;
  campaignId: string;
  date: string; // YYYY-MM-DD
  leads: number;
  spend: number;
  cpl: number;
  totalLeads: number;
  totalSpend: number;
}

export type AlertSeverity = 'OK' | 'WARNING' | 'CRITICAL';

export interface ClientSummary {
  client: Client;
  leadsToday: number;
  spendToday: number;
  cplToday: number | 'N/A';
  status: AlertSeverity;
  campaigns: (Campaign & { metrics?: DailyMetric })[];
}
