import type { ZipStateCounty } from '../types';
import type { ServiceResponse } from './baseService';
import zipData from '../data/lookup/zipStateCounty.json';
import { delay } from './baseService';

// Load data
const zipRecords: ZipStateCounty[] = zipData as ZipStateCounty[];

// Get location info by zip code
export const getLocationByZip = async (zipCode: string): Promise<ServiceResponse<ZipStateCounty[]>> => {
  await delay();
  
  const locations = zipRecords.filter(z => z.zipCode === zipCode);
  
  if (locations.length === 0) {
    return { success: false, error: 'Zip code not found' };
  }
  
  return { success: true, data: locations };
};

// Get all states
export const getStates = async (): Promise<ServiceResponse<{ value: string; label: string; abbr: string }[]>> => {
  await delay();
  
  const stateMap = new Map<string, { value: string; label: string; abbr: string }>();
  
  zipRecords.forEach(z => {
    if (!stateMap.has(z.stateAbbr)) {
      stateMap.set(z.stateAbbr, {
        value: z.stateAbbr,
        label: z.state,
        abbr: z.stateAbbr
      });
    }
  });
  
  const states = Array.from(stateMap.values()).sort((a, b) => 
    a.label.localeCompare(b.label)
  );
  
  return { success: true, data: states };
};

// Get counties by state
export const getCountiesByState = async (stateAbbr: string): Promise<ServiceResponse<string[]>> => {
  await delay();
  
  const counties = [...new Set(
    zipRecords
      .filter(z => z.stateAbbr === stateAbbr)
      .map(z => z.county)
  )].sort();
  
  return { success: true, data: counties };
};

// Get cities by state and county
export const getCitiesByStateCounty = async (
  stateAbbr: string, 
  county: string
): Promise<ServiceResponse<string[]>> => {
  await delay();
  
  const cities = [...new Set(
    zipRecords
      .filter(z => z.stateAbbr === stateAbbr && z.county === county)
      .map(z => z.city)
  )].sort();
  
  return { success: true, data: cities };
};

// Get zip codes by city
export const getZipCodesByCity = async (
  stateAbbr: string,
  city: string
): Promise<ServiceResponse<string[]>> => {
  await delay();
  
  const zipCodes = [...new Set(
    zipRecords
      .filter(z => z.stateAbbr === stateAbbr && z.city === city)
      .map(z => z.zipCode)
  )].sort();
  
  return { success: true, data: zipCodes };
};

// Get markets
export const getMarkets = async (): Promise<ServiceResponse<string[]>> => {
  await delay();
  
  const markets = [...new Set(zipRecords.map(z => z.market))].filter(Boolean).sort();
  
  return { success: true, data: markets };
};

// Get regions
export const getRegions = async (): Promise<ServiceResponse<string[]>> => {
  await delay();
  
  const regions = [...new Set(zipRecords.map(z => z.region))].filter(Boolean).sort();
  
  return { success: true, data: regions };
};

// Validate zip code exists
export const validateZipCode = async (zipCode: string): Promise<ServiceResponse<boolean>> => {
  await delay(50);
  
  const exists = zipRecords.some(z => z.zipCode === zipCode);
  
  return { success: true, data: exists };
};

// Auto-populate location from zip
export const autoPopulateFromZip = async (zipCode: string): Promise<ServiceResponse<{
  state: string;
  stateAbbr: string;
  county: string;
  city: string;
  region: string;
  market: string;
} | null>> => {
  await delay();
  
  const location = zipRecords.find(z => z.zipCode === zipCode);
  
  if (!location) {
    return { success: true, data: null };
  }
  
  return {
    success: true,
    data: {
      state: location.state,
      stateAbbr: location.stateAbbr,
      county: location.county,
      city: location.city,
      region: location.region,
      market: location.market
    }
  };
};

