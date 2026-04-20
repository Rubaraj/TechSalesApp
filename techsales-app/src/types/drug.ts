export interface Drug {
  drugId: string;
  gpiCode: string;
  ndc: string;
  brandName: string;
  genericName: string;
  drugLabelName: string;
  strength: string;
  strengthNumber: number;
  strengthUnit: string;
  dosageForm: DosageForm;
  drugClass: string;
  isBrand: boolean;
  isGeneric: boolean;
  isVaccine: boolean;
  frequencies: string[];
  commonQuantities: number[];
  tier?: number;
  requiresPriorAuth?: boolean;
  hasQuantityLimit?: boolean;
  quantityLimit?: string;
  hasStepTherapy?: boolean;
  route?: string;
  therapeuticCategory?: string;
  manufacturer?: string;
}

export type DosageForm = 
  | 'Tablet'
  | 'Capsule'
  | 'Solution'
  | 'Suspension'
  | 'Injection'
  | 'Cream'
  | 'Ointment'
  | 'Patch'
  | 'Inhaler'
  | 'Drops'
  | 'Spray'
  | 'Powder'
  | 'Chewable'
  | 'Extended Release'
  | 'Suppository';

export interface DrugSearchParams {
  searchTerm?: string;
  brandName?: string;
  genericName?: string;
  drugClass?: string;
  dosageForm?: DosageForm;
  isBrand?: boolean;
  isGeneric?: boolean;
  tier?: number;
  page?: number;
  pageSize?: number;
  [key: string]: any;
}

export interface DrugFrequency {
  value: string;
  label: string;
}

export const DRUG_FREQUENCIES: DrugFrequency[] = [
  { value: 'once_daily', label: 'Once Daily' },
  { value: 'twice_daily', label: 'Twice Daily' },
  { value: 'three_times_daily', label: 'Three Times Daily' },
  { value: 'four_times_daily', label: 'Four Times Daily' },
  { value: 'every_other_day', label: 'Every Other Day' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi_weekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'as_needed', label: 'As Needed' },
];

