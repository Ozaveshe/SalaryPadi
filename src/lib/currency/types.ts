export type ReferenceCurrencyRate = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  provider_name: string;
  source_url: string;
  license_url: string | null;
  attribution_text: string | null;
  observed_at: string;
  fetched_at: string;
  data_period: string;
};
