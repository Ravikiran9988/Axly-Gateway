import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, LogOut, Menu, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { systemApi } from '../../api/system';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

const ROUTE_BREADCRUMBS = {
  '/': ['Control', 'Dashboard'],
  '/providers': ['Infrastructure', 'Providers'],
  '/credentials': ['Infrastructure', 'Providers', 'Credentials'],
  '/models': ['Infrastructure', 'Providers', 'Model Catalog'],
  '/api-keys': ['Infrastructure', 'API Keys'],
  '/api-docs': ['Developer Reference', 'API Documentation'],
  '/routing': ['Control', 'Routing & Failover'],
  '/fallback-recovery': ['Control', 'Routing', 'Fallback & Recovery'],
  '/playground': ['Workbench', 'Playground'],
  '/request-logs': ['Workbench', 'Request Logs'],
  '/analytics': ['Workbench', 'Analytics'],
  '/settings': ['System', 'Settings'],
  '/health-monitor': ['System', 'Settings', 'Health Monitor'],
};

export function Header({ onOpenMobile }) {
  const { admin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const { data: readyData, isError: isReadyError } = useQuery({
    queryKey: ['gatewayReadyHeader'],
    queryFn: systemApi.getReady,
    refetchInterval: 30000,
    retry: 1,
  });

  const isReady = readyData?.ready === true && !isReadyError;
  const dbLatency = readyData?.checks?.database?.latency_ms;
  const crumbs = ROUTE_BREADCRUMBS[location.pathname] || ['Console'];

  return (
    <header className="sticky top-0 z-30 flex h-13 min-h-[52px] w-full items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobile}
          className="lg:hidden shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Live Gateway Probe Indicator */}
        <Link
          to="/settings?tab=health"
          title="View gateway subsystem diagnostics"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors shrink-0',
            isReady
              ? 'border-status-ok/30 bg-status-ok/10 text-status-ok hover:bg-status-ok/15'
              : readyData === undefined && !isReadyError
                ? 'border-border bg-muted text-muted-foreground'
                : 'border-status-err/30 bg-status-err/10 text-status-err hover:bg-status-err/15'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isReady
                ? 'bg-status-ok'
                : readyData === undefined && !isReadyError
                  ? 'bg-muted-foreground'
                  : 'bg-status-err'
            )}
            aria-hidden="true"
          />
          <span>
            {isReady
              ? `GATEWAY READY${dbLatency !== undefined ? ` · DB ${dbLatency}ms` : ''}`
              : readyData === undefined && !isReadyError
                ? 'PROBING GATEWAY...'
                : 'READINESS DEGRADED'}
          </span>
        </Link>

        {/* Compact Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground truncate">
          <span className="text-border font-mono">/</span>
          {crumbs.map((c, idx) => (
            <React.Fragment key={c}>
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
              <span
                className={cn(
                  'truncate',
                  idx === crumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {c}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link to="/api-docs">
          <Button
            variant={location.pathname.startsWith('/api-docs') ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5 text-xs"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">API Docs</span>
          </Button>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>

        {admin && (
          <div className="hidden md:flex items-center gap-1.5 border-l border-border pl-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-route" />
            <span className="font-mono text-[11px] text-foreground font-medium truncate max-w-[160px]">
              {admin.email}
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-xs text-muted-foreground hover:text-status-err gap-1.5"
          aria-label="Logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
