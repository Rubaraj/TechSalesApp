export interface Provider {
  providerId: string;
  providerIdentificationNumber: string;
  providerName: string;
  npi: string;
  capId?: string;
  contractPBP?: string;
  buildingName?: string;
  address: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  covered: boolean; // In Network / Out of Network
  isActive: boolean;
}

export interface ProviderSearchParams {
  searchTerm?: string;
  zipCode?: string;
  state?: string;
  county?: string;
  city?: string;
  covered?: boolean; // In Network only
  radius?: number; // miles
  [key: string]: any;
}

