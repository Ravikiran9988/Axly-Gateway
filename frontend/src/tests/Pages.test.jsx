import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { ApiDocs } from '../pages/ApiDocs';
import { Settings } from '../pages/Settings';
import { HealthMonitor } from '../pages/HealthMonitor';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';

// Mock system and settings APIs
vi.mock('../api/system', () => ({
  systemApi: {
    getHealth: vi.fn().mockResolvedValue({ status: 'ok', version: '0.1.0', uptime_seconds: 120 }),
    getReady: vi.fn().mockResolvedValue({ ready: true, checks: { database: { status: 'healthy', latency_ms: 1.2 } } }),
    getDiagnostics: vi.fn().mockResolvedValue({
      database: { status: 'healthy', latency_ms: 1.2, message: 'Database connection established' },
      encryption_service: { status: 'operational', algorithm: 'AES-256-GCM', key_configured: true },
      auth_service: { status: 'operational', algorithm: 'Argon2id + JWT' },
      system: { version: '0.1.0', environment: 'development', python_version: '3.12.0', platform: 'windows' },
      providers: { total: 3, active: 3, items: [] },
      credentials: { total: 5, healthy: 4, cooldown: 1, degraded: 0 },
      circuit_breakers: { total: 3, closed: 3, open: 0, half_open: 0 },
    }),
  },
}));

vi.mock('../api/settings', () => ({
  settingsApi: {
    listSettings: vi.fn().mockResolvedValue([
      { key: 'general', value: { app_name: 'AXLY Gateway', timezone: 'UTC', environment: 'development' } },
      { key: 'routing_defaults', value: { default_profile: 'default', max_attempts: 3, request_timeout: 30, streaming_timeout: 60 } },
      { key: 'security_logging', value: { log_payloads: false, log_responses: false } },
    ]),
    updateSetting: vi.fn().mockResolvedValue({ status: 'success' }),
  },
}));

describe('API Documentation Page', () => {
  it('renders API documentation with key endpoints and headers', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <ApiDocs />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('API Reference')).toBeInTheDocument();
    expect(screen.getAllByText(/\/v1\/chat\/completions/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Gateway Diagnostic Headers')).toBeInTheDocument();
    expect(screen.getByText('X-Axly-Request-Id')).toBeInTheDocument();
    expect(screen.getByText('X-Axly-Provider')).toBeInTheDocument();
    expect(screen.getByText(/HTTP Status & Retry Semantics/i)).toBeInTheDocument();
  });
});

describe('Settings & Health Monitor Pages', () => {
  it('renders Settings tabs and appearance switcher cleanly', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <ToastProvider>
              <Settings />
            </ToastProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText(/General & Routing/i)).toBeInTheDocument();
    expect(screen.getByText(/Security & Access/i)).toBeInTheDocument();
    expect(screen.getByText(/Health Monitor/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue('AXLY Gateway')).toBeInTheDocument();
    });
  });

  it('renders HealthMonitor on health diagnostics tab with mocked telemetry', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <ToastProvider>
              <HealthMonitor />
            </ToastProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('HEALTHY').length).toBeGreaterThan(0);
      expect(screen.getByText('CONNECTED')).toBeInTheDocument();
      expect(screen.getByText('AES-256-GCM')).toBeInTheDocument();
      expect(screen.getByText('Argon2id + JWT')).toBeInTheDocument();
    });
  });
});
