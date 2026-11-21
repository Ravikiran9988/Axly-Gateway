import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  KeyRound,
  Boxes,
  GitBranch,
  ShieldAlert,
  PlaySquare,
  Key,
  BookOpen,
  BarChart3,
  FileText,
  Activity,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Cpu,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

export const navigationSections = [
  {
    title: 'OVERVIEW',
    items: [
      { name: 'Overview', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'CONFIGURATION',
    items: [
      { name: 'Providers', href: '/providers', icon: Server },
      { name: 'Credentials', href: '/credentials', icon: KeyRound },
      { name: 'Models', href: '/models', icon: Boxes },
      { name: 'Routing', href: '/routing', icon: GitBranch },
      { name: 'Fallback & Recovery', href: '/fallback-recovery', icon: ShieldAlert },
    ],
  },
  {
    title: 'DEVELOPMENT',
    items: [
      { name: 'Playground', href: '/playground', icon: PlaySquare },
      { name: 'API Keys', href: '/api-keys', icon: Key },
      { name: 'API Documentation', href: '/api-docs', icon: BookOpen },
    ],
  },
  {
    title: 'OBSERVABILITY',
    items: [
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      { name: 'Request Logs', href: '/request-logs', icon: FileText },
      { name: 'Health Monitor', href: '/health-monitor', icon: Activity },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { name: 'Settings', href: '/settings', icon: SettingsIcon },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((s) => s.items);

export function Sidebar({ className, onCloseMobile }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className={cn(
        'flex h-full w-64 flex-col border-r bg-card text-card-foreground select-none',
        className
      )}
    >
      {/* Brand Header */}
      <div className="flex flex-col border-b px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight text-foreground">AXLY Gateway</span>
            <span className="block text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
              Self-Hosted v0.1.0
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-tight text-muted-foreground">
          One API. Intelligent Routing. Reliable Failover.
        </p>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="Main Navigation">
        {navigationSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-3 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/'}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0 transition-colors" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer / Theme Switcher */}
      <div className="border-t p-3">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Toggle theme"
        >
          <span className="flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">⌘T</span>
        </button>
      </div>
    </aside>
  );
}
