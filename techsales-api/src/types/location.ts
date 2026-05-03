export interface ZipStateCounty {
  zipCode: string;
  multiCountyZip: boolean;
  state: string;
  stateAbbr: string;
  county: string;
  countyFips: string;
  city: string;
  region: string;
  market: string;
  territory: string;
  maStatus: 'Current' | 'Whitespace' | 'Expansion';
  brand: string;
}

export interface LocationSearchParams {
  zipCode?: string;
  state?: string;
  county?: string;
  city?: string;
}

export interface StateOption {
  value: string;
  label: string;
  abbr: string;
}

export interface CountyOption {
  value: string;
  label: string;
  fips: string;
  state: string;
}

