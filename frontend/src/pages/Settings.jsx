import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  KeyRound,
  Save,
  Lock,
  Globe,
  GitBranch,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Switch } from '../components/ui/Switch';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { settingsApi } from '../api/settings';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export function Settings() {
  const { admin } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // General Settings
  const [appName, setAppName] = useState('AXLY Gateway');
  const [timezone, setTimezone] = useState('UTC');
  const [environment, setEnvironment] = useState('development');

  // Routing Defaults
  const [defaultProfile, setDefaultProfile] = useState('default');
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [requestTimeout, setRequestTimeout] = useState(30);
  const [streamingTimeout, setStreamingTimeout] = useState(60);

  // Security & Logging
  const [logPayloads, setLogPayloads] = useState(false);
  const [logResponses, setLogResponses] = useState(false);

  // Change Password Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const settingsList = await settingsApi.listSettings();
        if (Array.isArray(settingsList)) {
          settingsList.forEach((s) => {
            if (s.key === 'general' && s.value) {
              if (s.value.app_name) setAppName(s.value.app_name);
              if (s.value.timezone) setTimezone(s.value.timezone);
              if (s.value.environment) setEnvironment(s.value.environment);
            } else if (s.key === 'routing_defaults' && s.value) {
              if (s.value.default_profile) setDefaultProfile(s.value.default_profile);
              if (s.value.max_attempts !== undefined) setMaxAttempts(s.value.max_attempts);
              if (s.value.request_timeout !== undefined) setRequestTimeout(s.value.request_timeout);
              if (s.value.streaming_timeout !== undefined) setStreamingTimeout(s.value.streaming_timeout);
            } else if (s.key === 'security_logging' && s.value) {
              if (s.value.log_payloads !== undefined) setLogPayloads(Boolean(s.value.log_payloads));
              if (s.value.log_responses !== undefined) setLogResponses(Boolean(s.value.log_responses));
            }
          });
        }
      } catch (err) {
        toast.error('Failed to load system settings');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [toast]);

  // Save General
  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      await settingsApi.updateSetting('general', {
        value: { app_name: appName, timezone, environment },
        description: 'General system configuration',
      });
      toast.success('General settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save general settings');
    } finally {
      setSavingGeneral(false);
    }
  };

  // Save Routing
  const handleSaveRouting = async (e) => {
    e.preventDefault();
    setSavingRouting(true);
    try {
      await settingsApi.updateSetting('routing_defaults', {
        value: {
          default_profile: defaultProfile,
          max_attempts: Number(maxAttempts) || 3,
          request_timeout: Number(requestTimeout) || 30,
          streaming_timeout: Number(streamingTimeout) || 60,
        },
        description: 'Routing engine timeouts and failover limits',
      });
      toast.success('Routing defaults saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save routing defaults');
    } finally {
      setSavingRouting(false);
    }
  };

  // Save Security Logging
  const handleSaveSecurity = async () => {
    setSavingSecurity(true);
    try {
      await settingsApi.updateSetting('security_logging', {
        value: {
          log_payloads: logPayloads,
          log_responses: logResponses,
          redact_secrets: true,
        },
        description: 'Privacy and prompt payload logging preferences',
      });
      toast.success('Security & logging settings updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update security settings');
    } finally {
      setSavingSecurity(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Administrator password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Failed to change password. Verify current password.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure gateway behavior, routing defaults, logging policies, and administrator credentials."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">General Settings</CardTitle>
            </div>
            <CardDescription>
              Platform identification and environment timezone properties.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <form onSubmit={handleSaveGeneral} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Application Name</label>
                  <Input
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    required
                    placeholder="AXLY Gateway"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Timezone</label>
                    <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      <option value="UTC">UTC (Universal)</option>
                      <option value="America/New_York">America/New_York (EST/EDT)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Environment</label>
                    <Input value={environment} disabled className="bg-muted uppercase font-mono text-xs" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" size="sm" disabled={savingGeneral} className="gap-2">
                    <Save className="h-3.5 w-3.5" />
                    {savingGeneral ? 'Saving...' : 'Save General Settings'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Routing Engine Defaults */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Routing Defaults</CardTitle>
            </div>
            <CardDescription>
              Execution limits and timeouts applied across client completions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <form onSubmit={handleSaveRouting} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Default Profile</label>
                    <Input
                      value={defaultProfile}
                      onChange={(e) => setDefaultProfile(e.target.value)}
                      placeholder="default"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Max Routing Attempts</label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Request Timeout (sec)</label>
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      value={requestTimeout}
                      onChange={(e) => setRequestTimeout(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Streaming Timeout (sec)</label>
                    <Input
                      type="number"
                      min={10}
                      max={600}
                      value={streamingTimeout}
                      onChange={(e) => setStreamingTimeout(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" size="sm" disabled={savingRouting} className="gap-2">
                    <Save className="h-3.5 w-3.5" />
                    {savingRouting ? 'Saving...' : 'Save Routing Defaults'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Security & Logging Policy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Security & Logging Policy</CardTitle>
            </div>
            <CardDescription>
              Data privacy controls and encryption standards for inference requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">Log Request Messages</p>
                  <p className="text-[11px] text-muted-foreground">
                    Record full user prompt payloads in request logs for observability.
                  </p>
                </div>
                <Switch checked={logPayloads} onCheckedChange={setLogPayloads} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">Log Response Messages</p>
                  <p className="text-[11px] text-muted-foreground">
                    Record LLM output completions in request logs.
                  </p>
                </div>
                <Switch checked={logResponses} onCheckedChange={setLogResponses} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-foreground">Secret Redaction</p>
                    <Badge variant="success" className="text-[10px] py-0">Enforced</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Provider API keys and client secrets are stripped from all logs and telemetry.
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveSecurity}
                disabled={savingSecurity}
                className="gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                {savingSecurity ? 'Saving...' : 'Update Policy'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Administrator Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Administrator Security</CardTitle>
            </div>
            <CardDescription>
              Update your administrator login credentials ({admin?.email || 'admin'}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Current Password</label>
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">New Password</label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Confirm New Password</label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" size="sm" disabled={changingPassword} className="gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  {changingPassword ? 'Updating...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
export default Settings;
