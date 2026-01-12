# Developer Guide - TechSales App

This guide provides detailed information for developers working on the TechSales application, including architecture decisions, patterns, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Concepts](#key-concepts)
3. [Component Patterns](#component-patterns)
4. [Service Layer](#service-layer)
5. [State Management](#state-management)
6. [Theming System](#theming-system)
7. [Data Models](#data-models)
8. [Common Patterns](#common-patterns)
9. [Troubleshooting](#troubleshooting)

## Architecture Overview

### Technology Stack

- **React 19**: Latest React with concurrent features
- **TypeScript 5.9**: Strict type checking
- **Vite 7**: Fast build tool and dev server
- **Tailwind CSS v4**: Utility-first CSS with custom theme system
- **React Router DOM v7**: Client-side routing
- **Context API**: Global state management (no Redux needed)

### Design Principles

1. **Component-Based**: Reusable, composable components
2. **Type-Safe**: Full TypeScript coverage
3. **Service Layer**: Separation of data access from UI
4. **Theme-Aware**: All colors use CSS variables for theme switching
5. **Responsive**: Mobile-first design approach
6. **Accessible**: Semantic HTML and ARIA attributes

## Key Concepts

### 1. Theme System

The application supports multiple color themes that can be switched dynamically:

```typescript
// ThemeContext provides:
const { colorTheme, setColorTheme } = useTheme();
// colorTheme: 'default' | 'aetna' | 'humana'
```

**Implementation:**
- CSS variables defined in `src/index.css` using `@theme` directive
- Theme classes applied to `document.documentElement`
- All components use `primary-*` Tailwind classes that reference CSS variables

**Important:** Never use hardcoded color classes like `bg-orange-500`. Always use `bg-primary-500` for theme-aware colors.

### 2. Authentication & Authorization

**AuthContext** (`src/context/AuthContext.tsx`):
- Manages user authentication state
- Provides `user`, `member`, `isAdmin`, `hasPermission()` functions
- Handles login/logout

**Permission System:**
```typescript
// Check if user can perform action
hasPermission('leads', 'create')  // Returns boolean
hasPermission('plans', 'view')    // Returns boolean
```

**Roles & Permissions:**
- Defined in `src/data/runtime/roles.json`
- Format: `{ module: string, actions: string[] }`
- Modules: dashboard, leads, plans, pharmacy, drugs, pba, pbkit, etc.
- Actions: view, create, edit, delete, export

### 3. Lead Lifecycle

Leads progress through defined stages:

```typescript
type LeadStatus = 
  | 'New Lead'
  | 'Contacted Lead'
  | 'Appointment Schedule'
  | 'Enrollment in progress'
  | 'Enrolled'
  | 'Dropped / Lost lead';
```

**Visual Representation:**
- Dashboard: Progress bar showing counts per stage
- Lead Detail: Horizontal timeline with icons
- Admin Dashboard: Multi-line bar chart

**Lead Source:**
Every lead must have a source:
```typescript
type LeadSource = 'Web' | 'Call' | 'Event' | 'Referral' | 'Vendor';
```

### 4. Multi-Carrier Plans

Plans can belong to different insurance carriers:

```typescript
interface Plan {
  // ... other fields
  carrier?: string;  // 'Aetna', 'Humana', 'UnitedHealthcare', etc.
}
```

**Filtering:**
- Plans can be filtered by carrier in Plan List
- Premium and benefit data is carrier-agnostic
- Documents are plan-specific

## Component Patterns

### Common Components

Located in `src/components/common/`:

- **Button**: `variant`, `size`, `leftIcon`, `rightIcon` props
- **Input**: `type`, `label`, `error`, `icon` props
- **Select**: `label`, `options`, `value`, `onChange` props
- **Modal**: `isOpen`, `onClose`, `title`, `size` props
- **Table**: Generic table with sorting, pagination
- **Badge**: Status indicators with color variants
- **StatusBadge**: Lead status-specific badge
- **Tabs**: Tab navigation with multiple variants
- **SearchInput**: Debounced search with clear button
- **LeadAutocomplete**: Autocomplete for lead selection

### Component Structure

```typescript
// Example component structure
interface ComponentProps {
  // Props interface
}

export function Component({ prop1, prop2 }: ComponentProps) {
  // Hooks
  // State
  // Effects
  // Handlers
  
  return (
    // JSX
  );
}
```

### Layout Components

- **Layout** (`src/components/layout/Layout.tsx`): Main app layout with sidebar
- **Header** (`src/components/layout/Header.tsx`): Top navigation bar
- **Sidebar**: Navigation menu (embedded in Layout)

## Service Layer

### Service Pattern

Services in `src/services/` simulate API calls:

```typescript
// Example: leadService.ts
export async function getAllLeads(): Promise<Lead[]> {
  await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
  const data = await import('../data/runtime/leads.json');
  return data.default;
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const leads = await getAllLeads();
  return leads.find(l => l.leadId === id) || null;
}
```

### Service Functions

**Common Patterns:**
- `getAll*()`: Fetch all records
- `get*ById(id)`: Fetch single record
- `create*(data)`: Create new record
- `update*(id, data)`: Update existing record
- `delete*(id)`: Soft delete (set `isDeleted: true`)
- `search*(query, filters)`: Search with filters

**Error Handling:**
Services throw errors that should be caught in components:

```typescript
try {
  const lead = await getLeadById(id);
  if (!lead) {
    // Handle not found
  }
} catch (error) {
  // Handle error
}
```

## State Management

### Context API

Two main contexts:

1. **AuthContext**: User authentication and permissions
2. **ThemeContext**: Theme and color theme management

### Local State

Use React hooks for component-level state:

```typescript
const [state, setState] = useState<Type>(initialValue);
const [data, setData] = useState<DataType | null>(null);
const [loading, setLoading] = useState(false);
```

### Data Fetching Pattern

```typescript
useEffect(() => {
  async function fetchData() {
    setLoading(true);
    try {
      const result = await serviceFunction();
      setData(result);
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  }
  fetchData();
}, [dependencies]);
```

## Theming System

### CSS Variables

Defined in `src/index.css`:

```css
@theme {
  --color-primary-500: #f97316; /* Default orange */
}

:root.theme-aetna {
  --color-primary-500: #5a2e6f; /* Aetna purple */
}

:root.theme-humana {
  --color-primary-500: #5c9a1b; /* Humana green */
}
```

### Using Themes

```tsx
// ✅ Correct - Theme-aware
<button className="bg-primary-600 hover:bg-primary-700">
  Click me
</button>

// ❌ Wrong - Hardcoded color
<button className="bg-orange-600 hover:bg-orange-700">
  Click me
</button>
```

### Dark Mode

Dark mode classes use Tailwind's `dark:` variant:

```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
  Content
</div>
```

## Data Models

### Lead Model

```typescript
interface Lead {
  leadId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: 'Male' | 'Female';
  email: string;
  phone: string;
  address1: string;
  zipCode: string;
  state: string;
  county: string;
  city: string;
  medicareNumber?: string;
  medicaidId?: string;
  partADate?: string;
  partBDate?: string;
  leadStatus: LeadStatus;
  source: LeadSource;  // Required field
  permissionToContact: boolean;
  existingAetnaMember: boolean;
  tobaccoUsage: boolean;
  taggedPharmacies: string[];  // Max 3 pharmacy IDs
  taggedDrugs: TaggedDrug[];
  createdAt: string;
  createdBy: string;
}
```

### Plan Model

```typescript
interface Plan {
  planId: string;
  contractYear: number;
  contractNumber: string;
  pbp: string;
  planName: string;
  product: ProductType;
  planType: PlanType;
  category: PlanCategory;
  carrier?: string;  // Insurance carrier
  documents?: PlanDocument[];  // Plan documents
  // ... other fields
}

interface Benefit {
  benefitId: string;
  planId: string;
  category: BenefitCategory;
  isAvailable?: boolean;  // For tick/cross display
  // ... other fields
}
```

## Common Patterns

### Form Handling

```typescript
const [formData, setFormData] = useState<FormDataType>(initialData);
const [errors, setErrors] = useState<Record<string, string>>({});

const handleChange = (field: string, value: any) => {
  setFormData(prev => ({ ...prev, [field]: value }));
  // Clear error for this field
  if (errors[field]) {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }
};

const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  // Validate
  // Submit
};
```

### Search & Filter

```typescript
const [searchQuery, setSearchQuery] = useState('');
const [filters, setFilters] = useState<Filters>({});

const filteredData = useMemo(() => {
  return data.filter(item => {
    // Search logic
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Filter logic
    if (filters.status && item.status !== filters.status) {
      return false;
    }
    return true;
  });
}, [data, searchQuery, filters]);
```

### Loading States

```typescript
const [loading, setLoading] = useState(false);
const [data, setData] = useState<DataType | null>(null);

if (loading) {
  return <LoadingSpinner />;
}

if (!data) {
  return <EmptyState />;
}

return <DataDisplay data={data} />;
```

### Error Handling

```typescript
const [error, setError] = useState<string | null>(null);

try {
  const result = await serviceFunction();
  setData(result);
  setError(null);
} catch (err) {
  setError(err instanceof Error ? err.message : 'An error occurred');
}
```

## Troubleshooting

### Theme Not Changing

1. Check that `ThemeContext` is wrapping the app
2. Verify CSS variables are defined in `index.css`
3. Ensure components use `primary-*` classes, not hardcoded colors
4. Check browser console for CSS errors

### Permission Issues

1. Verify user has correct role in `users.json`
2. Check role permissions in `roles.json`
3. Ensure `hasPermission()` is called correctly
4. Check `AuthContext` is providing permissions

### Data Not Loading

1. Check service function is importing correct JSON file
2. Verify JSON file path is correct
3. Check for TypeScript type mismatches
4. Verify async/await is used correctly

### TypeScript Errors

1. Ensure all types are imported correctly
2. Check for `any` types that should be specific
3. Verify interface definitions match JSON structure
4. Use type assertions carefully: `as Type`

### Build Errors

1. Run `npm run build` to see full error messages
2. Check for missing imports
3. Verify all dependencies are installed
4. Clear `node_modules` and reinstall if needed

## Best Practices

1. **Always use TypeScript**: Avoid `any` types
2. **Follow naming conventions**: PascalCase for components, camelCase for functions
3. **Use semantic HTML**: Proper HTML elements for accessibility
4. **Support dark mode**: Always include dark mode variants
5. **Make components reusable**: Extract common patterns
6. **Handle loading/error states**: Always show appropriate UI states
7. **Use service layer**: Never import JSON files directly in components
8. **Document complex logic**: Add comments for non-obvious code
9. **Keep components small**: Split large components into smaller ones
10. **Test manually**: Test all user flows before committing

## File Organization

### When to Create New Files

- **New Component**: If it's reusable, add to `components/common/`
- **New Page**: Add to `pages/` and update routes
- **New Service**: Add to `services/` if it accesses data
- **New Type**: Add to `types/` if it's a data model
- **New Utility**: Add to `utils/` if it's a helper function

### Naming Conventions

- **Components**: PascalCase (`LeadForm.tsx`)
- **Services**: camelCase (`leadService.ts`)
- **Types**: PascalCase interfaces, camelCase types (`Lead`, `LeadStatus`)
- **Utils**: camelCase (`dateUtils.ts`)
- **Files**: Match export name when possible

## Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vite Guide](https://vitejs.dev/guide/)
- [React Router Documentation](https://reactrouter.com/)
