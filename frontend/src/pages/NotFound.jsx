import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <HelpCircle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold tracking-tight">404 — Page Not Found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The requested gateway console route does not exist.
      </p>
      <Link to="/" className="mt-6">
        <Button size="sm">Return to Overview</Button>
      </Link>
    </div>
  );
}
