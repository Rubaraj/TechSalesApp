import type { Provider, ProviderSearchParams } from '../types';
export type { ProviderSearchParams } from '../types';
import type { ServiceResponse } from './baseService';
import providerData from '../data/lookup/providerData.json';
import { 
  delay, 
  searchByFields, 
  sortByField, 
  paginateItems,
} from './baseService';

// Load data
const providers: Provider[] = providerData as Provider[];

// Get all providers
export const getAllProviders = async (): Promise<ServiceResponse<Provider[]>> => {
  await delay();
  return { success: true, data: providers.filter(p => p.isActive) };
};

// Get provider by ID
export const getProviderById = async (providerId: string): Promise<ServiceResponse<Provider>> => {
  await delay();
  const provider = providers.find(p => p.providerId === providerId && p.isActive);

  if (!provider) {
    return { success: false, error: 'Provider not found' };
  }

  return { success: true, data: provider };
};

/**
 * Phase 3b.1 — Synchronous name lookup for the LeadForm AI auto-tag consumer.
 * The backend emits `add_provider({providerName: 'Dr. Smith'})` from
 * anchor-based extraction; we try to resolve the captured name against the
 * 60-entry provider catalog by fuzzy (contains, case-insensitive) match on
 * the providerName field. Returns null when no match — caller then emits
 * a `catalog_miss` activity entry so the agent doesn't lose the info.
 *
 * If `zipCode` is provided, prefer a provider whose zipCode shares the first
 * 3 digits.
 */
export const findProviderByName = (
  name: string,
  zipCode?: string,
): Provider | null => {
  if (!name) return null;
  // Strip a leading "Dr. " / "Dr " before searching — catalog rows usually
  // store names without the prefix.
  const cleaned = name.replace(/^dr\.?\s+/i, '').trim().toLowerCase();
  if (!cleaned) return null;
  const matches = providers.filter(
    (p) => p.isActive && (p.providerName ?? '').toLowerCase().includes(cleaned),
  );
  if (matches.length === 0) return null;
  if (!zipCode || zipCode.length < 3) return matches[0];
  const zipPrefix = zipCode.slice(0, 3);
  const nearMatch = matches.find((p) => (p.zipCode ?? '').startsWith(zipPrefix));
  return nearMatch ?? matches[0];
};

// Search providers
export const searchProviders = async (
  params: ProviderSearchParams & { 
    searchTerm?: string;
    page?: number;
    pageSize?: number;
    sortField?: keyof Provider;
    sortDirection?: 'asc' | 'desc';
  }
): Promise<ServiceResponse<{
  data: Provider[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> => {
  await delay();
  
  let filteredProviders = providers.filter(p => p.isActive);
  
  // Apply search term
  if (params.searchTerm) {
    filteredProviders = searchByFields(filteredProviders, params.searchTerm, [
      'providerName', 'npi', 'address', 'city', 'buildingName'
    ]);
  }
  
  // Apply location filters
  if (params.zipCode) {
    filteredProviders = filteredProviders.filter(p => p.zipCode === params.zipCode);
  }
  if (params.state) {
    filteredProviders = filteredProviders.filter(p => p.state === params.state);
  }
  if (params.county) {
    filteredProviders = filteredProviders.filter(p => 
      p.county.toLowerCase() === params.county!.toLowerCase()
    );
  }
  if (params.city) {
    filteredProviders = filteredProviders.filter(p => 
      p.city.toLowerCase().includes(params.city!.toLowerCase())
    );
  }
  
  // Apply coverage filter
  if (params.covered !== undefined) {
    filteredProviders = filteredProviders.filter(p => p.covered === params.covered);
  }
  
  // Apply sorting
  if (params.sortField) {
    filteredProviders = sortByField(
      filteredProviders, 
      params.sortField, 
      params.sortDirection || 'asc'
    );
  } else {
    // Default sort by name
    filteredProviders = sortByField(filteredProviders, 'providerName', 'asc');
  }
  
  // Apply pagination
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredProviders, page, pageSize);
  
  return {
    success: true,
    data: { data, total, page, pageSize, totalPages }
  };
};

// Get providers by zip code
export const getProvidersByZip = async (zipCode: string): Promise<ServiceResponse<Provider[]>> => {
  await delay();
  const zipProviders = providers.filter(p => p.zipCode === zipCode && p.isActive);
  return { success: true, data: zipProviders };
};

// Get providers by state
export const getProvidersByState = async (state: string): Promise<ServiceResponse<Provider[]>> => {
  await delay();
  const stateProviders = providers.filter(p => p.state === state && p.isActive);
  return { success: true, data: stateProviders };
};

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Get nearby providers by coordinates
export const getNearbyProviders = async (
  latitude: number,
  longitude: number,
  radiusMiles: number = 10
): Promise<ServiceResponse<(Provider & { distance: number })[]>> => {
  await delay();
  
  const nearbyProviders = providers
    .filter(p => p.isActive && p.latitude && p.longitude)
    .map(p => ({
      ...p,
      distance: calculateDistance(latitude, longitude, p.latitude, p.longitude)
    }))
    .filter(p => p.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
  
  return { success: true, data: nearbyProviders };
};

