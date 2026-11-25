import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled UI Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-status-err/30 bg-status-err/10 text-status-err">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold tracking-tight text-foreground">
            Interface error encountered
          </h2>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground leading-relaxed">
            {this.state.error?.message || 'An unexpected rendering issue interrupted this view.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="mt-5 gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload Console
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
