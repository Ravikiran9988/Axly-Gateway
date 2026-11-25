import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Key,
  GitBranch,
  PlaySquare,
  FileText,
  BarChart3,
  Settings as SettingsIcon,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

export const navigationSections = [
  {
    title: 'CONTROL',
    items: [
      {
        name: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
        matchPaths: ['/'],
      },
      {
        name: 'Routing',
        href: '/routing',
        icon: GitBranch,
        matchPaths: ['/routing', '/fallback-recovery'],
      },
    ],
  },
  {
    title: 'INFRASTRUCTURE',
    items: [
      {
        name: 'Providers',
        href: '/providers',
        icon: Server,
        matchPaths: ['/providers', '/credentials', '/models'],
      },
      {
        name: 'API Keys',
        href: '/api-keys',
        icon: Key,
        matchPaths: ['/api-keys', '/keys'],
      },
    ],
  },
  {
    title: 'WORKBENCH',
    items: [
      {
        name: 'Playground',
        href: '/playground',
        icon: PlaySquare,
        matchPaths: ['/playground'],
      },
      {
        name: 'Request Logs',
        href: '/request-logs',
        icon: FileText,
        matchPaths: ['/request-logs'],
      },
      {
        name: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
        matchPaths: ['/analytics'],
      },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      {
        name: 'Settings',
        href: '/settings',
        icon: SettingsIcon,
        matchPaths: ['/settings', '/health-monitor'],
      },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((s) => s.items);

export function Sidebar({
  className,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const isRouteActive = (item) => {
    if (item.href === '/') {
      return location.pathname === '/';
    }
    return item.matchPaths.some((p) => location.pathname.startsWith(p));
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-rail text-foreground select-none transition-all duration-150',
        collapsed ? 'w-16' : 'w-60',
        className
      )}
    >
      {/* Swiss Architectural Brand Header */}
      <div className={cn('border-b-2 border-rule-strong', collapsed ? 'px-3 py-4 flex justify-center' : 'px-4 py-4')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex shrink-0 items-center justify-center rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary-foreground">
              AXLY
            </span>
            {!collapsed && (
              <span className="font-bold text-sm tracking-tight text-foreground truncate">
                Gateway
              </span>
            )}
          </div>
          {!collapsed && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse navigation rail"
              aria-label="Collapse navigation rail"
              className="hidden lg:inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!collapsed && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            One API. Intelligent Routing. Zero-Downtime Failover.
          </p>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3" aria-label="Main Navigation">
        {navigationSections.map((section) => (
          <div key={section.title} className="space-y-0.5">
            {!collapsed && (
              <div className="px-2.5 pb-1 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground/80 uppercase">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(item);
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.name : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center rounded text-xs font-medium transition-colors duration-150 border',
                    collapsed ? 'justify-center px-2 py-2' : 'justify-between px-2.5 py-2',
                    active
                      ? 'bg-card text-foreground border-border font-semibold'
                      : 'border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </span>
                  {!collapsed && active && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Rail Controls Footer */}
      <div className="border-t border-border p-2.5 space-y-1">
        {collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand navigation rail"
            aria-label="Expand navigation rail"
            className="hidden lg:flex w-full items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          title={collapsed ? (theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode') : undefined}
          className={cn(
            'flex w-full items-center rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            collapsed ? 'justify-center p-2' : 'justify-between px-2.5 py-2'
          )}
          aria-label="Toggle color theme"
        >
          <span className="flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            {!collapsed && <span>{theme === 'dark' ? 'Dark Theme' : 'Light Theme'}</span>}
          </span>
          {!collapsed && (
            <kbd className="font-mono text-[10px] text-muted-foreground border border-border rounded-sm px-1 py-0.5 bg-background">
              Ctrl+T
            </kbd>
          )}
        </button>
      </div>
    </aside>
  );
}
