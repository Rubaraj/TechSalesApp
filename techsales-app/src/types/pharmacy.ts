export interface Pharmacy {
  pharmacyId: string;
  npi: string;
  ncpdpId?: string;
  name: string;
  chainName?: string;
  chainId?: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  phone: string;
  fax?: string;
  pharmacyType: PharmacyType;
  is24Hour: boolean;
  hasDriveThru: boolean;
  isOpen7Days: boolean;
  hasDelivery: boolean;
  languages: string[];
  latitude: number;
  longitude: number;
  isActive: boolean;
  isRetail?: boolean;
  isMailOrder?: boolean;
  isSpecialty?: boolean;
  isPreferred?: boolean;
}

export type PharmacyType = 
  | 'Retail'
  | 'Chain Retail'
  | 'Mail Order'
  | 'Specialty'
  | 'Long Term Care'
  | 'Compounding'
  | 'Hospital'
  | 'Clinic';

export interface PharmacySearchParams {
  searchTerm?: string;
  zipCode?: string;
  state?: string;
  county?: string;
  city?: string;
  chainName?: string;
  is24Hour?: boolean;
  hasDriveThru?: boolean;
  radius?: number; // miles
  [key: string]: any;
}

