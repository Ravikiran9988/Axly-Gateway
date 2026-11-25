import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      toast.success('Signed in to gateway console');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid administrator email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center rounded-sm bg-primary px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-primary-foreground">
              AXLY
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">AXLY Gateway</h1>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            One API. Intelligent Routing. Zero-Downtime Failover.
          </p>
        </div>

        <div className="rounded border border-border bg-card p-6 rule-strong-t">
          <div className="pb-4 border-b border-border">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Administrator Login
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Authenticate to manage upstream providers, credentials, and routing policies.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded border border-status-err/40 bg-status-err/10 p-3 text-xs text-status-err"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-foreground block">
                Admin Email
              </label>
              <Input
                id="login-email"
                type="email"
                required
                placeholder="admin@yourdomain.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-xs font-medium text-foreground block">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
