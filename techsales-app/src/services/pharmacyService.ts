import type { Pharmacy, PharmacySearchParams } from '../types';
export type { PharmacySearchParams } from '../types';
import type { ServiceResponse } from './baseService';
import pharmacyData from '../data/lookup/pharmacyData.json';
import { 
  delay, 
  searchByFields, 
  sortByField, 
  paginateItems,
} from './baseService';

// Load data
const pharmacies: Pharmacy[] = pharmacyData as Pharmacy[];

// Get all pharmacies
export const getAllPharmacies = async (): Promise<ServiceResponse<Pharmacy[]>> => {
  await delay();
  return { success: true, data: pharmacies.filter(p => p.isActive) };
};

// Get pharmacy by ID
export const getPharmacyById = async (pharmacyId: string): Promise<ServiceResponse<Pharmacy>> => {
  await delay();
  const pharmacy = pharmacies.find(p => p.pharmacyId === pharmacyId && p.isActive);

  if (!pharmacy) {
    return { success: false, error: 'Pharmacy not found' };
  }

  return { success: true, data: pharmacy };
};

/**
 * Phase 3b.1 — Synchronous chain-name lookup for the LeadForm AI auto-tag
 * consumer. When the prospect says "I use CVS", we resolve to the first
 * matching pharmacy in that chain. If a `zipCode` is provided, prefer a
 * store whose zipCode shares the first 3 digits (loose geographic match);
 * otherwise return the first matching chain store.
 *
 * Synchronous (no `delay()`) because it runs inside a useEffect during a
 * live call and must complete in microseconds, not the artificial 50-300ms
 * delay the other catalog functions use to mimic an HTTP round-trip.
 */
export const findPharmacyByChainName = (
  chainName: string,
  zipCode?: string,
): Pharmacy | null => {
  if (!chainName) return null;
  const lower = chainName.trim().toLowerCase();
  const matches = pharmacies.filter(
    (p) =>
      p.isActive &&
      ((p.chainName ?? '').toLowerCase() === lower ||
        (p.name ?? '').toLowerCase().includes(lower)),
  );
  if (matches.length === 0) return null;
  if (!zipCode || zipCode.length < 3) return matches[0];
  const zipPrefix = zipCode.slice(0, 3);
  const nearMatch = matches.find((p) => (p.zipCode ?? '').startsWith(zipPrefix));
  return nearMatch ?? matches[0];
};

// Search pharmacies
export const searchPharmacies = async (
  params: PharmacySearchParams & { 
    searchTerm?: string;
    page?: number;
    pageSize?: number;
    sortField?: keyof Pharmacy;
    sortDirection?: 'asc' | 'desc';
  }
): Promise<ServiceResponse<{
  data: Pharmacy[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> => {
  await delay();
  
  let filteredPharmacies = pharmacies.filter(p => p.isActive);
  
  // Apply search term
  if (params.searchTerm) {
    filteredPharmacies = searchByFields(filteredPharmacies, params.searchTerm, [
      'name', 'chainName', 'address', 'city'
    ]);
  }
  
  // Apply location filters
  if (params.zipCode) {
    filteredPharmacies = filteredPharmacies.filter(p => p.zipCode === params.zipCode);
  }
  if (params.state) {
    filteredPharmacies = filteredPharmacies.filter(p => p.state === params.state);
  }
  if (params.county) {
    filteredPharmacies = filteredPharmacies.filter(p => 
      p.county.toLowerCase() === params.county!.toLowerCase()
    );
  }
  if (params.city) {
    filteredPharmacies = filteredPharmacies.filter(p => 
      p.city.toLowerCase().includes(params.city!.toLowerCase())
    );
  }
  
  // Apply feature filters
  if (params.chainName) {
    filteredPharmacies = filteredPharmacies.filter(p => 
      p.chainName?.toLowerCase().includes(params.chainName!.toLowerCase())
    );
  }
  if (params.is24Hour !== undefined) {
    filteredPharmacies = filteredPharmacies.filter(p => p.is24Hour === params.is24Hour);
  }
  if (params.hasDriveThru !== undefined) {
    filteredPharmacies = filteredPharmacies.filter(p => p.hasDriveThru === params.hasDriveThru);
  }
  
  // Apply sorting
  if (params.sortField) {
    filteredPharmacies = sortByField(
      filteredPharmacies, 
      params.sortField, 
      params.sortDirection || 'asc'
    );
  } else {
    // Default sort by name
    filteredPharmacies = sortByField(filteredPharmacies, 'name', 'asc');
  }
  
  // Apply pagination
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredPharmacies, page, pageSize);
  
  return {
    success: true,
    data: { data, total, page, pageSize, totalPages }
  };
};

// Get pharmacies by zip code
export const getPharmaciesByZip = async (zipCode: string): Promise<ServiceResponse<Pharmacy[]>> => {
  await delay();
  const zipPharmacies = pharmacies.filter(p => p.zipCode === zipCode && p.isActive);
  return { success: true, data: zipPharmacies };
};

// Get pharmacies by state
export const getPharmaciesByState = async (state: string): Promise<ServiceResponse<Pharmacy[]>> => {
  await delay();
  const statePharmacies = pharmacies.filter(p => p.state === state && p.isActive);
  return { success: true, data: statePharmacies };
};

// Get pharmacies by chain
export const getPharmaciesByChain = async (chainName: string): Promise<ServiceResponse<Pharmacy[]>> => {
  await delay();
  const chainPharmacies = pharmacies.filter(p => 
    p.chainName?.toLowerCase() === chainName.toLowerCase() && p.isActive
  );
  return { success: true, data: chainPharmacies };
};

// Get unique chain names
export const getChainNames = async (): Promise<ServiceResponse<string[]>> => {
  await delay();
  const chains = [...new Set(
    pharmacies
      .filter(p => p.chainName && p.isActive)
      .map(p => p.chainName!)
  )].sort();
  return { success: true, data: chains };
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

// Get nearby pharmacies by coordinates
export const getNearbyPharmacies = async (
  latitude: number,
  longitude: number,
  radiusMiles: number = 10
): Promise<ServiceResponse<(Pharmacy & { distance: number })[]>> => {
  await delay();
  
  const nearbyPharmacies = pharmacies
    .filter(p => p.isActive && p.latitude && p.longitude)
    .map(p => ({
      ...p,
      distance: calculateDistance(latitude, longitude, p.latitude, p.longitude)
    }))
    .filter(p => p.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
  
  return { success: true, data: nearbyPharmacies };
};

