import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, ShieldCheck } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';

export function Setup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { checkStatus } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.completeSetup(email, password);
      toast.success('Admin account created successfully! Please sign in.');
      await checkStatus();
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Failed to complete initial setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Cpu className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">AXLY Gateway</h1>
          <p className="mt-1 text-xs text-muted-foreground uppercase font-mono tracking-wider">
            First-Run System Setup
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Administrator</CardTitle>
            <CardDescription>
              Initialize your self-hosted AXLY Gateway with your primary administrator credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Admin Email</label>
                <Input
                  type="email"
                  required
                  placeholder="admin@yourdomain.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Password (min 8 chars)</label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Confirm Password</label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
                {isSubmitting ? 'Initializing...' : 'Initialize Gateway'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
