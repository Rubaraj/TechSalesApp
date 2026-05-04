import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, MapPin, Search, Building2, Pill, ChevronDown, User } from 'lucide-react';
import { Button, Input, Select, Badge, DatePicker } from '../../components/common';
import { PharmacySearch, DrugSearch, ProviderSearch } from '../../components/tagging';
import { useAuth } from '../../context/AuthContext';
import type { Lead, LeadStatus, LeadSource, ZipStateCounty, TaggedDrug } from '../../types';
import { getLeadById, createLead, updateLead } from '../../services/leadService';
import { getLocationByZip, getCountiesByState } from '../../services/zipService';
import { aiService } from '../../services/aiService';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { calculateAge } from '../../utils/dateUtils';

const statusOptions = [
  { value: 'New Lead', label: 'New Lead' },
  { value: 'Contacted Lead', label: 'Contacted Lead' },
  { value: 'Appointment Schedule', label: 'Appointment Schedule' },
  { value: 'Enrollment in progress', label: 'Enrollment in progress' },
  { value: 'Enrolled', label: 'Enrolled' },
  { value: 'Dropped / Lost lead', label: 'Dropped / Lost lead' },
];

const sourceOptions = [
  { value: 'Web', label: 'Web' },
  { value: 'Call', label: 'Call' },
  { value: 'Event', label: 'Event' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Vendor', label: 'Vendor' },
];

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  state: string;
  county: string;
  zipCode: string;
  mbi: string;
  partAEffectiveDate: string;
  partBEffectiveDate: string;
  isDualEligible: boolean;
  isLISEligible: boolean;
  medicaidNumber: string;
  status: LeadStatus;
  source: LeadSource;
  notes: string;
}

const initialFormData: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  address: '',
  city: '',
  state: '',
  county: '',
  zipCode: '',
  mbi: '',
  partAEffectiveDate: '',
  partBEffectiveDate: '',
  isDualEligible: false,
  isLISEligible: false,
  medicaidNumber: '',
  status: 'New Lead',
  source: 'Web',
  notes: '',
};

export function LeadForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const aiEnabled = useAiEnabled();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [taggedPharmacies, setTaggedPharmacies] = useState<string[]>([]);
  const [taggedDrugs, setTaggedDrugs] = useState<TaggedDrug[]>([]);
  const [taggedProviders, setTaggedProviders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpZip, setIsLookingUpZip] = useState(false);
  const [zipSuggestions, setZipSuggestions] = useState<ZipStateCounty[]>([]);
  const [countyOptions, setCountyOptions] = useState<string[]>([]);
  const [isMultiCountyZip, setIsMultiCountyZip] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Load existing lead data if editing
  useEffect(() => {
    if (id) {
      setIsLoading(true);
      getLeadById(id).then((result) => {
        if (result.success && result.data) {
          const lead = result.data;
          setFormData({
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
            dateOfBirth: lead.dob,
            address: lead.address1,
            city: lead.city,
            state: lead.state,
            county: lead.county,
            zipCode: lead.zipCode,
            mbi: lead.medicareNumber || '',
            partAEffectiveDate: lead.partADate || '',
            partBEffectiveDate: lead.partBDate || '',
            isDualEligible: Boolean(lead.medicaidId),
            isLISEligible: false, // This field doesn't exist in Lead, will need to be added if needed
            medicaidNumber: lead.medicaidId || '',
            status: lead.leadStatus,
            source: lead.source || 'Web',
            notes: '', // Notes field doesn't exist in Lead interface
          });
          // Load tagged pharmacies and drugs
          setTaggedPharmacies(lead.taggedPharmacies || []);
          setTaggedDrugs(lead.taggedDrugs || []);
          setTaggedProviders(lead.taggedProviders || []);
        }
        setIsLoading(false);
      });
    }
  }, [id]);

  // Auto-populate based on zip code
  const handleZipLookup = useCallback(async (zipCode: string) => {
    if (zipCode.length !== 5 || !/^\d{5}$/.test(zipCode)) return;
    
    setIsLookingUpZip(true);
    const result = await getLocationByZip(zipCode);
    setIsLookingUpZip(false);

    if (result.success && result.data && result.data.length > 0) {
      const locations = result.data;
      const firstLocation = locations[0];
      
      // Get unique counties for this zip
      const uniqueCounties = [...new Set(locations.map(loc => loc.county))];
      setCountyOptions(uniqueCounties);
      setIsMultiCountyZip(uniqueCounties.length > 1);
      
      // Auto-fill state, city, and county
      setFormData(prev => ({
        ...prev,
        city: firstLocation.city,
        state: firstLocation.stateAbbr,
        county: uniqueCounties.length === 1 ? firstLocation.county : prev.county,
      }));
      
      // If multiple counties, show selection dropdown
      if (uniqueCounties.length > 1) {
        setZipSuggestions(locations);
      } else {
        setZipSuggestions([]);
      }
      
      // Clear any errors for auto-filled fields
      setErrors(prev => ({ ...prev, state: undefined, county: undefined, zipCode: undefined }));
    } else {
      // Zip code not found - show error and clear suggestions
      setZipSuggestions([]);
      setCountyOptions([]);
      setIsMultiCountyZip(false);
      setErrors(prev => ({ ...prev, zipCode: 'Zip code not found. Please enter manually.' }));
    }
  }, []);

  const selectZipLocation = (location: ZipStateCounty) => {
    setFormData(prev => ({
      ...prev,
      city: location.city,
      state: location.stateAbbr,
      county: location.county,
    }));
    setZipSuggestions([]);
    setIsMultiCountyZip(false);
    setErrors(prev => ({ ...prev, state: undefined, county: undefined }));
  };

  // Auto-trigger zip lookup when zip code reaches 5 digits
  useEffect(() => {
    if (formData.zipCode.length === 5 && /^\d{5}$/.test(formData.zipCode)) {
      handleZipLookup(formData.zipCode);
    } else if (formData.zipCode.length < 5) {
      // Clear location fields when zip is incomplete (only during new entry, not edit)
      setZipSuggestions([]);
      setCountyOptions([]);
      setIsMultiCountyZip(false);
    }
  }, [formData.zipCode, handleZipLookup]);

  // Load counties when state changes (for manual state selection scenario)
  useEffect(() => {
    const loadCounties = async () => {
      if (formData.state && formData.state.length === 2) {
        const result = await getCountiesByState(formData.state);
        if (result.success && result.data) {
          setCountyOptions(result.data);
        }
      }
    };
    loadCounties();
  }, [formData.state]);


  // Validation - returns [isValid, firstErrorKey]
  // Only sets error for the FIRST invalid field to avoid showing all errors at once
  const validate = (): [boolean, string | null] => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    let firstErrorKey: string | null = null;

    // Check fields in order and only set the first error
    if (!firstErrorKey && !formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
      firstErrorKey = 'firstName';
    } else if (!firstErrorKey && !formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
      firstErrorKey = 'lastName';
    } else if (!firstErrorKey && !formData.email.trim()) {
      newErrors.email = 'Email is required';
      firstErrorKey = 'email';
    } else if (!firstErrorKey && formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
      firstErrorKey = 'email';
    } else if (!firstErrorKey && !formData.phone.trim()) {
      newErrors.phone = 'Phone is required';
      firstErrorKey = 'phone';
    } else if (!firstErrorKey && formData.phone.trim() && formData.phone.length !== 10) {
      newErrors.phone = 'Phone must be exactly 10 digits';
      firstErrorKey = 'phone';
    } else if (!firstErrorKey && !formData.dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required';
      firstErrorKey = 'dateOfBirth';
    } else if (!firstErrorKey && !formData.address.trim()) {
      newErrors.address = 'Address is required';
      firstErrorKey = 'address';
    } else if (!firstErrorKey && !formData.city.trim()) {
      newErrors.city = 'City is required';
      firstErrorKey = 'city';
    } else if (!firstErrorKey && !formData.state.trim()) {
      newErrors.state = 'State is required';
      firstErrorKey = 'state';
    } else if (!firstErrorKey && !formData.zipCode.trim()) {
      newErrors.zipCode = 'Zip code is required';
      firstErrorKey = 'zipCode';
    } else if (!firstErrorKey && formData.zipCode.trim() && !/^\d{5}$/.test(formData.zipCode)) {
      newErrors.zipCode = 'Zip code must be 5 digits';
      firstErrorKey = 'zipCode';
    } else if (!firstErrorKey && !formData.source) {
      newErrors.source = 'Source is required';
      firstErrorKey = 'source';
    }

    setErrors(newErrors);
    return [firstErrorKey === null, firstErrorKey];
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSubmitError('');
    setHasAttemptedSubmit(true);

    const [isValid, firstErrorKey] = validate();
    
    if (!isValid && firstErrorKey) {
      // Scroll to first error field smoothly after state update
      setTimeout(() => {
        // Convert camelCase to kebab-case for ID matching (e.g., firstName -> first-name)
        const idFromKey = firstErrorKey.replace(/([A-Z])/g, '-$1').toLowerCase();
        const element = document.getElementById(idFromKey);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus the input element specifically
          const input = element.querySelector('input') || element;
          if (input && input instanceof HTMLElement) {
            input.focus();
          }
        }
      }, 100);
      return;
    }

    setIsSaving(true);

    const leadData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      dob: formData.dateOfBirth,
      gender: 'Male' as const, // Default, should be added to form
      email: formData.email,
      phone: formData.phone,
      address1: formData.address,
      address2: undefined,
      zipCode: formData.zipCode,
      state: formData.state,
      county: formData.county,
      city: formData.city,
      medicareNumber: formData.mbi || undefined,
      medicaidId: formData.medicaidNumber || undefined,
      partADate: formData.partAEffectiveDate || undefined,
      partBDate: formData.partBEffectiveDate || undefined,
      leadStatus: formData.status,
      source: formData.source,
      permissionToContact: true, // Default, should be added to form
      existingCarrier1Member: false, // Default, should be added to form
      tobaccoUsage: false, // Default, should be added to form
      taggedPharmacies,
      taggedDrugs,
      taggedProviders,
    };

    let result;
    if (isEditing && id) {
      result = await updateLead(id, leadData, user?.userId || '');
    } else {
      result = await createLead(leadData as any, user?.userId || '');
    }

    setIsSaving(false);

    if (result.success) {
      // Phase 3 — kick off a background recommendation pre-warm so the
      // RecommendedPlansTab on the lead detail page is hot-cached when the
      // user lands on it. Fire-and-forget; never block navigation.
      if (aiEnabled && !isEditing && result.data?.leadId) {
        void aiService.recommend(result.data.leadId, {
          ...(user?.userId ? { userId: user.userId } : {}),
        });
      }
      navigate('/leads');
    } else {
      setSubmitError(result.error || 'Failed to save lead');
    }
  };

  // Handle input changes
  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData({ ...formData, [field]: value });
    // Clear all errors when user starts typing to provide fresh validation on next submit
    if (errors[field]) {
      setErrors({});
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/leads')}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isEditing ? 'Edit Lead' : 'Create New Lead'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {isEditing ? 'Update lead information' : 'Fill in the details to create a new lead'}
        </p>
      </div>

      {submitError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {submitError}
        </div>
      )}

      <form 
        onSubmit={(e) => {
          const submitter = (e.nativeEvent as SubmitEvent)?.submitter;
          
          // ONLY allow form submission from the actual submit button
          const isFromSubmitButton = submitter?.getAttribute('data-submit-source') === 'button';
          const isFromFormNoValidate = submitter?.getAttribute('formNoValidate') !== null;
          
          if (!isFromSubmitButton || isFromFormNoValidate) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          handleSubmit(e);
        }} 
        className="space-y-8" 
        noValidate
      >
        {/* Personal Information */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Personal Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              error={hasAttemptedSubmit ? errors.firstName : undefined}
              maxLength={15}
              required
            />
            <Input
              label="Last Name"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              error={hasAttemptedSubmit ? errors.lastName : undefined}
              maxLength={15}
              required
            />
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              error={hasAttemptedSubmit ? errors.email : undefined}
              required
            />
            <Input
              label="Phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => {
                // Only allow digits, max 10
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                handleChange('phone', digits);
              }}
              error={hasAttemptedSubmit ? errors.phone : undefined}
              placeholder="5555555555"
              maxLength={10}
              required
            />
            <DatePicker
              label="Date of Birth"
              value={formData.dateOfBirth}
              onChange={(date) => handleChange('dateOfBirth', date)}
              error={hasAttemptedSubmit ? errors.dateOfBirth : undefined}
              required
              maxDate={new Date().toISOString().split('T')[0]}
            />
            <Input
              label="Age"
              type="text"
              value={formData.dateOfBirth ? `${calculateAge(formData.dateOfBirth)} years` : ''}
              onChange={() => {}}
              disabled
              placeholder="Auto-calculated from DOB"
            />
            <Select
              label="Status"
              options={statusOptions}
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
            />
            <Select
              label="Source"
              options={sourceOptions}
              value={formData.source}
              onChange={(e) => handleChange('source', e.target.value)}
              error={hasAttemptedSubmit ? errors.source : undefined}
              required
            />
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Address Information
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Enter the zip code to auto-populate state and county.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Street Address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                error={hasAttemptedSubmit ? errors.address : undefined}
                required
              />
            </div>
            <div className="relative">
              <Input
                label="Zip Code"
                value={formData.zipCode}
                onChange={(e) => {
                  // Only allow numbers and max 5 digits
                  const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                  handleChange('zipCode', value);
                }}
                error={hasAttemptedSubmit ? errors.zipCode : undefined}
                placeholder="12345"
                required
                rightIcon={isLookingUpZip ? <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> : <Search className="w-4 h-4" />}
              />
              {/* Multi-county selection dropdown */}
              {zipSuggestions.length > 1 && isMultiCountyZip && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    This zip code spans multiple counties. Please select:
                  </div>
                  {zipSuggestions.map((loc, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectZipLocation(loc)}
                      className="w-full px-4 py-2 text-left hover:bg-orange-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-orange-500" />
                      <span className="text-gray-900 dark:text-white">
                        {loc.city}, {loc.stateAbbr} - <span className="font-medium text-orange-600">{loc.county}</span> County
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input
              label="City"
              value={formData.city}
              onChange={(e) => handleChange('city', e.target.value)}
              error={hasAttemptedSubmit ? errors.city : undefined}
              required
            />
            <div className="relative">
              <Input
                label="State"
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value.toUpperCase().slice(0, 2))}
                error={hasAttemptedSubmit ? errors.state : undefined}
                placeholder="e.g. NY, CA, TX"
                required
              />
              {formData.state && (
                <div className="absolute right-3 top-9 text-xs text-green-600 dark:text-green-400">
                  ✓ Auto-filled
                </div>
              )}
            </div>
            <div className="relative">
              {countyOptions.length > 1 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    County
                  </label>
                  <div className="relative">
                    <select
                      value={formData.county}
                      onChange={(e) => handleChange('county', e.target.value)}
                      className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer"
                    >
                      <option value="">Select County</option>
                      {countyOptions.map((county) => (
                        <option key={county} value={county}>
                          {county}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              ) : (
                <Input
                  label="County"
                  value={formData.county}
                  onChange={(e) => handleChange('county', e.target.value)}
                  placeholder="Auto-filled from zip code"
                />
              )}
              {formData.county && countyOptions.length <= 1 && (
                <div className="absolute right-3 top-9 text-xs text-green-600 dark:text-green-400">
                  ✓ Auto-filled
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Medicare Information */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Medicare Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="MBI (Medicare Beneficiary Identifier)"
              value={formData.mbi}
              onChange={(e) => handleChange('mbi', e.target.value)}
              placeholder="1EG4-TE5-MK72"
            />
            <DatePicker
              label="Part A Effective Date"
              value={formData.partAEffectiveDate}
              onChange={(date) => handleChange('partAEffectiveDate', date)}
            />
            <DatePicker
              label="Part B Effective Date"
              value={formData.partBEffectiveDate}
              onChange={(date) => handleChange('partBEffectiveDate', date)}
            />
            <Input
              label="Medicaid Number"
              value={formData.medicaidNumber}
              onChange={(e) => handleChange('medicaidNumber', e.target.value)}
            />
            <div className="md:col-span-2 flex flex-wrap gap-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isDualEligible}
                  onChange={(e) => handleChange('isDualEligible', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-gray-700 dark:text-gray-300">Dual Eligible (Medicare + Medicaid)</span>
                {formData.isDualEligible && <Badge variant="warning">Dual</Badge>}
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isLISEligible}
                  onChange={(e) => handleChange('isLISEligible', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-gray-700 dark:text-gray-300">LIS Eligible (Low Income Subsidy)</span>
                {formData.isLISEligible && <Badge variant="info">LIS</Badge>}
              </label>
            </div>
          </div>
        </div>

        {/* Pharmacy Tagging */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Preferred Pharmacies
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Search and select up to 5 pharmacies that the beneficiary uses regularly.
          </p>
          <PharmacySearch
            selectedPharmacies={taggedPharmacies}
            onSelect={setTaggedPharmacies}
            zipCode={formData.zipCode}
          />
        </div>

        {/* Drug Tagging */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Current Medications
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Search and add the beneficiary's current prescription medications with dosage details.
          </p>
          <DrugSearch
            taggedDrugs={taggedDrugs}
            onUpdate={setTaggedDrugs}
          />
        </div>

        {/* Provider Tagging */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Preferred Providers
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Search and select up to 5 doctors or practitioners that the beneficiary sees regularly.
          </p>
          <ProviderSearch
            selectedProviders={taggedProviders}
            onSelect={setTaggedProviders}
            zipCode={formData.zipCode}
          />
        </div>

        {/* Notes */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Notes
          </h2>
          <textarea
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="Add any additional notes about this lead..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/leads')}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            isLoading={isSaving}
            onClick={(e) => {
              // Mark that submission is from the actual submit button
              (e.currentTarget as HTMLButtonElement).setAttribute('data-submit-source', 'button');
            }}
          >
            <Save className="w-4 h-4" />
            {isEditing ? 'Update Lead' : 'Create Lead'}
          </Button>
        </div>
      </form>
    </div>
  );
}

