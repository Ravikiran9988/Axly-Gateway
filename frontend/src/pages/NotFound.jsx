import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded border border-border bg-card text-muted-foreground">
        <HelpCircle className="h-5 w-5" />
      </div>
      <h1 className="mt-4 font-mono text-lg font-bold tracking-tight text-foreground">
        404 — Route Not Found
      </h1>
      <p className="mt-1.5 text-xs text-muted-foreground max-w-sm">
        The requested AXLY Gateway console route does not exist.
      </p>
      <Link to="/" className="mt-5">
        <Button size="sm">Return to Dashboard</Button>
      </Link>
    </div>
  );
}
