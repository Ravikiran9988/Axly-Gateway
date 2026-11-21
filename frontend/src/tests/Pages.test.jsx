import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ApiDocs } from '../pages/ApiDocs';
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
    render(
      <BrowserRouter>
        <ToastProvider>
          <ApiDocs />
        </ToastProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('API Documentation')).toBeInTheDocument();
    expect(screen.getByText('POST /v1/chat/completions')).toBeInTheDocument();
    expect(screen.getByText('Drop-in Replacement for any OpenAI SDK or Client')).toBeInTheDocument();
    expect(screen.getByText('Model Aliases')).toBeInTheDocument();
    expect(screen.getByText('Response Transparency Headers')).toBeInTheDocument();
  });
});
