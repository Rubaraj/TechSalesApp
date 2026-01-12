import { useState, useEffect, useRef } from 'react';
import { Search, X, User, Loader2 } from 'lucide-react';
import { getAllLeads } from '../../services/leadService';
import type { Lead } from '../../types';

interface LeadAutocompleteProps {
  value: string;
  onChange: (leadId: string, lead: Lead | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function LeadAutocomplete({
  value,
  onChange,
  placeholder = 'Type to search for a lead...',
  label,
  className = '',
}: LeadAutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load all leads on mount
  useEffect(() => {
    const loadLeads = async () => {
      setIsLoading(true);
      const result = await getAllLeads();
      if (result.success && result.data) {
        setLeads(result.data);
      }
      setIsLoading(false);
    };
    loadLeads();
  }, []);

  // Filter leads based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredLeads([]);
      setIsOpen(false);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = leads.filter(lead => {
      const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase();
      const email = lead.email?.toLowerCase() || '';
      const phone = lead.phone?.replace(/\D/g, '') || '';
      const searchPhone = term.replace(/\D/g, '');

      return (
        fullName.includes(term) ||
        email.includes(term) ||
        phone.includes(searchPhone) ||
        lead.leadId.toLowerCase().includes(term)
      );
    }).slice(0, 10); // Limit to 10 results

    setFilteredLeads(filtered);
    setIsOpen(filtered.length > 0);
  }, [searchTerm, leads]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load selected lead when value changes
  useEffect(() => {
    if (value && !selectedLead) {
      const lead = leads.find(l => l.leadId === value);
      if (lead) {
        setSelectedLead(lead);
        setSearchTerm(`${lead.firstName} ${lead.lastName}`);
      }
    }
  }, [value, leads, selectedLead]);

  const handleSelect = (lead: Lead) => {
    setSelectedLead(lead);
    setSearchTerm(`${lead.firstName} ${lead.lastName}`);
    setIsOpen(false);
    onChange(lead.leadId, lead);
  };

  const handleClear = () => {
    setSearchTerm('');
    setSelectedLead(null);
    setIsOpen(false);
    onChange('', null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    if (selectedLead) {
      setSelectedLead(null);
      onChange('', null);
    }
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => {
            if (filteredLeads.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
        />
        {(searchTerm || selectedLead) && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && filteredLeads.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredLeads.map((lead) => (
            <button
              key={lead.leadId}
              onClick={() => handleSelect(lead)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {lead.firstName} {lead.lastName}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {lead.email} • {lead.phone}
                  </div>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {lead.leadId}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && filteredLeads.length === 0 && searchTerm.trim() && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center text-gray-500 dark:text-gray-400">
          No leads found
        </div>
      )}
    </div>
  );
}
