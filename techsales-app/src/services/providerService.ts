import type { Provider, ProviderSearchParams } from '../types';
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

