import React from 'react';
import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export function Header({ onOpenMobile }) {
  const { admin, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobile}
          className="lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="gap-1.5 py-0.5 font-normal text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Gateway Operational
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {admin && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground border-r pr-3">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-foreground font-medium">{admin.email}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-xs text-muted-foreground hover:text-destructive gap-1.5"
          aria-label="Logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
