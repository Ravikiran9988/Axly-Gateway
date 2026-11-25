import React, { createContext, useContext, useState } from 'react';
import { cn } from '../../lib/utils';

const TabsContext = createContext(null);

export function Tabs({ defaultValue, value, onValueChange, variant = 'line', className, children }) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = value !== undefined ? value : internalValue;

  const handleSelect = (val) => {
    if (onValueChange) onValueChange(val);
    if (value === undefined) setInternalValue(val);
  };

  return (
    <TabsContext.Provider value={{ activeValue, handleSelect, variant }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }) {
  const { variant } = useContext(TabsContext);
  if (variant === 'segmented') {
    return (
      <div
        role="tablist"
        className={cn(
          'inline-flex h-9 items-center justify-start rounded border border-border bg-surface-subtle p-1 text-muted-foreground',
          className
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-border overflow-x-auto',
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className, children, disabled }) {
  const { activeValue, handleSelect, variant } = useContext(TabsContext);
  const isActive = activeValue === value;

  if (variant === 'segmented') {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        disabled={disabled}
        onClick={() => handleSelect(value)}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
          isActive
            ? 'bg-card text-foreground border border-border shadow-sm font-semibold'
            : 'text-muted-foreground hover:text-foreground',
          className
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => handleSelect(value)}
      className={cn(
        'relative inline-flex items-center justify-center whitespace-nowrap px-3.5 py-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 border-b-2 -mb-px',
        isActive
          ? 'border-primary text-foreground font-semibold'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }) {
  const { activeValue } = useContext(TabsContext);
  if (activeValue !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn(
        'mt-4 focus-visible:outline-none',
        className
      )}
    >
      {children}
    </div>
  );
}
