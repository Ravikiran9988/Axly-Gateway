import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Sun, Moon, Shield, Sliders, Activity } from 'lucide-react';
import { settingsApi } from '../api/settings';
import { authApi } from '../api/auth';
import { useTheme } from '../context/ThemeContext';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { Skeleton } from '../components/ui/Skeleton';
import { HealthMonitorPanel } from '../components/system/HealthMonitorPanel';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

export function Settings({ initialTab = 'general' }) {
  const { theme, setTheme } = useTheme();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || initialTab);

  useEffect(() => {
    if (tabParam && ['general', 'security', 'health'].includes(tabParam)) {
      setActiveTab(tabParam);
    } else {
      setActiveTab(initialTab);
    }
  }, [tabParam, initialTab]);

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    if (tabParam) {
      setSearchParams(nextTab === 'general' ? {} : { tab: nextTab }, { replace: true });
    }
  };

  const { data: settingsList = [], isLoading: isSettingsLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: settingsApi.listSettings,
  });

  const [generalForm, setGeneralForm] = useState({
    app_name: 'AXLY Gateway',
    environment: 'production',
    timezone: 'UTC',
  });
  const [routingForm, setRoutingForm] = useState({
    default_profile: 'default',
    max_attempts: 3,
    request_timeout: 30,
    streaming_timeout: 60,
  });
  const [securityForm, setSecurityForm] = useState({
    log_payloads: false,
    log_responses: false,
    log_retention_days: 30,
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!Array.isArray(settingsList) || settingsList.length === 0) return;

    const findSetting = (k) => settingsList.find((item) => item.key === k)?.value || {};
    const gen = findSetting('general');
    const rt = findSetting('routing_defaults');
    const sec = findSetting('security_logging');

    if (Object.keys(gen).length > 0) {
      setGeneralForm((prev) => ({
        ...prev,
        ...gen,
        app_name: gen.app_name ?? gen.gateway_name ?? prev.app_name,
        timezone: gen.timezone ?? gen.default_timezone ?? prev.timezone,
      }));
    }
    if (Object.keys(rt).length > 0) {
      setRoutingForm((prev) => ({ ...prev, ...rt }));
    }
    if (Object.keys(sec).length > 0) {
      setSecurityForm((prev) => ({ ...prev, ...sec }));
    }
  }, [settingsList]);

  const saveSettingMutation = useMutation({
    mutationFn: ({ key, value, description }) =>
      settingsApi.updateSetting(key, { value, description }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      addToast(`Saved "${variables.key}" configuration`, 'success');
    },
    onError: (err) => addToast(err.message || 'Failed to save configuration', 'error'),
  });

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast('Administrator password updated', 'success');
    },
    onError: (err) => addToast(err.message || 'Password update failed', 'error'),
  });

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      addToast('Enter both current and new passwords.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      addToast('New password must be at least 8 characters.', 'error');
      return;
    }
    passwordMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Gateway defaults, theme selection, administrator security controls, and real-time runtime health diagnostics."
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} variant="line">
        <TabsList>
          <TabsTrigger value="general">
            <Sliders className="h-3.5 w-3.5 mr-1.5" />
            General &amp; Routing
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Security &amp; Access
          </TabsTrigger>
          <TabsTrigger value="health">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Health Monitor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-5 space-y-6">
          {/* Theme Surface Selector */}
          <section className="rounded border border-border bg-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dark mode is the operational default. Switch anytime or press{' '}
                  <kbd className="rounded border border-border bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px]">
                    Ctrl+T
                  </kbd>
                  .
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'flex items-center gap-3 rounded border p-3.5 text-left transition-colors',
                  theme === 'dark'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-surface-subtle text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded border border-border bg-[#0F1115] text-white shrink-0">
                  <Moon className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-xs font-semibold text-foreground">
                    Swiss Charcoal Rail (Dark)
                  </span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    Default control room
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'flex items-center gap-3 rounded border p-3.5 text-left transition-colors',
                  theme === 'light'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-surface-subtle text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded border border-border bg-[#F8F8F6] text-[#111317] shrink-0">
                  <Sun className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-xs font-semibold text-foreground">
                    Swiss Station Paper (Light)
                  </span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    Daylight high-contrast
                  </span>
                </div>
              </button>
            </div>
          </section>

          {isSettingsLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* General Gateway Identity */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveSettingMutation.mutate({
                    key: 'general',
                    value: generalForm,
                    description: 'General gateway display identity and environment defaults',
                  });
                }}
                className="rounded border border-border bg-card p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="border-b border-border pb-3">
                    <h2 className="text-sm font-semibold text-foreground">Gateway Profile</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Control plane identification stored under the <code className="font-mono text-foreground">general</code> settings namespace.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="set-gw-name"
                      className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                    >
                      Gateway Instance Name
                    </label>
                    <Input
                      id="set-gw-name"
                      value={generalForm.app_name ?? ''}
                      onChange={(e) =>
                        setGeneralForm((prev) => ({ ...prev, app_name: e.target.value }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="set-env"
                        className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                      >
                        Environment Label
                      </label>
                      <Input
                        id="set-env"
                        value={generalForm.environment ?? ''}
                        onChange={(e) =>
                          setGeneralForm((prev) => ({ ...prev, environment: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="set-tz"
                        className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                      >
                        Display Timezone
                      </label>
                      <Input
                        id="set-tz"
                        value={generalForm.timezone ?? ''}
                        onChange={(e) =>
                          setGeneralForm((prev) => ({ ...prev, timezone: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={saveSettingMutation.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Profile
                  </Button>
                </div>
              </form>

              {/* Routing Defaults */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveSettingMutation.mutate({
                    key: 'routing_defaults',
                    value: routingForm,
                    description: 'Default routing, failover attempts, and timeout thresholds',
                  });
                }}
                className="rounded border border-border bg-card p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="border-b border-border pb-3">
                    <h2 className="text-sm font-semibold text-foreground">Routing Defaults</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Fallback engine parameters applied when request profiles do not override values.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="set-profile"
                        className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                      >
                        Default Profile
                      </label>
                      <Input
                        id="set-profile"
                        value={routingForm.default_profile ?? 'default'}
                        onChange={(e) =>
                          setRoutingForm((prev) => ({ ...prev, default_profile: e.target.value }))
                        }
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="set-attempts"
                        className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                      >
                        Max Attempts
                      </label>
                      <Input
                        id="set-attempts"
                        type="number"
                        min={1}
                        max={10}
                        value={routingForm.max_attempts ?? 3}
                        onChange={(e) =>
                          setRoutingForm((prev) => ({
                            ...prev,
                            max_attempts: Number(e.target.value),
                          }))
                        }
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="set-timeout"
                        className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                      >
                        Request Timeout (s)
                      </label>
                      <Input
                        id="set-timeout"
                        type="number"
                        min={5}
                        max={300}
                        value={routingForm.request_timeout ?? 30}
                        onChange={(e) =>
                          setRoutingForm((prev) => ({
                            ...prev,
                            request_timeout: Number(e.target.value),
                          }))
                        }
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="set-stream-timeout"
                        className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                      >
                        Streaming Timeout (s)
                      </label>
                      <Input
                        id="set-stream-timeout"
                        type="number"
                        min={5}
                        max={600}
                        value={routingForm.streaming_timeout ?? 60}
                        onChange={(e) =>
                          setRoutingForm((prev) => ({
                            ...prev,
                            streaming_timeout: Number(e.target.value),
                          }))
                        }
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={saveSettingMutation.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save Routing Defaults
                  </Button>
                </div>
              </form>
            </div>
          )}
        </TabsContent>

        <TabsContent value="security" className="pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Security & Logging */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSettingMutation.mutate({
                  key: 'security_logging',
                  value: securityForm,
                  description: 'Audit log retention and payload diagnostics policy',
                });
              }}
              className="rounded border border-border bg-card p-5 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="border-b border-border pb-3">
                  <h2 className="text-sm font-semibold text-foreground">Security &amp; Audit Logging</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Audit trace capture and payload logging controls for stored request telemetry.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded border border-border bg-surface-subtle px-3.5 py-2.5">
                  <div>
                    <label htmlFor="set-log-payloads" className="text-xs font-semibold text-foreground block">
                      Capture Prompt Payloads
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Retain prompt messages in request inspection metadata
                    </span>
                  </div>
                  <Switch
                    id="set-log-payloads"
                    checked={Boolean(securityForm.log_payloads)}
                    onCheckedChange={(checked) =>
                      setSecurityForm((prev) => ({ ...prev, log_payloads: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded border border-border bg-surface-subtle px-3.5 py-2.5">
                  <div>
                    <label htmlFor="set-log-responses" className="text-xs font-semibold text-foreground block">
                      Capture Completion Payloads
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Retain completion body metadata alongside execution traces
                    </span>
                  </div>
                  <Switch
                    id="set-log-responses"
                    checked={Boolean(securityForm.log_responses)}
                    onCheckedChange={(checked) =>
                      setSecurityForm((prev) => ({ ...prev, log_responses: checked }))
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor="set-retention"
                    className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                  >
                    Log Retention Window (Days)
                  </label>
                  <Input
                    id="set-retention"
                    type="number"
                    min={1}
                    max={3650}
                    value={securityForm.log_retention_days ?? 30}
                    onChange={(e) =>
                      setSecurityForm((prev) => ({
                        ...prev,
                        log_retention_days: Number(e.target.value),
                      }))
                    }
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" size="sm" disabled={saveSettingMutation.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Security Policy
                </Button>
              </div>
            </form>

            {/* Change Admin Password */}
            <form
              onSubmit={handlePasswordSubmit}
              className="rounded border border-border bg-card p-5 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="border-b border-border pb-3">
                  <h2 className="text-sm font-semibold text-foreground">Administrator Credentials</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Rotate your control-plane administrator login password.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pwd-current"
                    className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                  >
                    Current Password
                  </label>
                  <Input
                    id="pwd-current"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="pwd-new"
                      className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                    >
                      New Password
                    </label>
                    <Input
                      id="pwd-new"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pwd-confirm"
                      className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
                    >
                      Confirm Password
                    </label>
                    <Input
                      id="pwd-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" size="sm" disabled={passwordMutation.isPending}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="health" className="pt-5">
          <HealthMonitorPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default Settings;
