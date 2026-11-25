import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/65 transition-opacity duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative z-50 w-full rounded border border-border bg-card text-card-foreground shadow-xl flex flex-col max-h-[88vh]',
          sizeMap[size] || sizeMap.md
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 rule-strong-t rounded-t">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 shrink-0"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3 bg-surface-subtle rounded-b">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
