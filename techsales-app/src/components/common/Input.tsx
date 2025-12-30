import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Calendar } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const isDateInput = type === 'date';

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
              {leftIcon}
            </div>
          )}
          
          {/* Calendar icon for date inputs */}
          {isDateInput && !leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none z-10">
              <Calendar className="w-4 h-4" />
            </div>
          )}
          
          <input
            ref={ref}
            id={inputId}
            type={type}
            className={`
              w-full px-3 py-2.5 rounded-lg border
              text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent
              disabled:cursor-not-allowed disabled:bg-gray-100 disabled:dark:bg-gray-700/50 disabled:text-gray-500 disabled:dark:text-gray-400
              ${props.disabled ? 'bg-gray-100 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800'}
              ${leftIcon || isDateInput ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              ${error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }
              ${isDateInput ? `
                appearance-none
                [&::-webkit-calendar-picker-indicator]:opacity-0
                [&::-webkit-calendar-picker-indicator]:absolute
                [&::-webkit-calendar-picker-indicator]:right-0
                [&::-webkit-calendar-picker-indicator]:w-full
                [&::-webkit-calendar-picker-indicator]:h-full
                [&::-webkit-calendar-picker-indicator]:cursor-pointer
                cursor-pointer
              ` : ''}
              ${className}
            `}
            {...props}
          />
          
          {/* Custom date picker indicator */}
          {isDateInput && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
          
          {rightIcon && !isDateInput && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>
        
        {error && (
          <p className="mt-1 text-sm text-red-500">{error}</p>
        )}
        
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
