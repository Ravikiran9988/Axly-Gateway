import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

import { Overview } from './pages/Overview';
import { Providers } from './pages/Providers';
import { Credentials } from './pages/Credentials';
import { Models } from './pages/Models';
import { Routing } from './pages/Routing';
import { FallbackRecovery } from './pages/FallbackRecovery';
import { Playground } from './pages/Playground';
import { ApiKeys } from './pages/ApiKeys';
import { ApiDocs } from './pages/ApiDocs';
import { Analytics } from './pages/Analytics';
import { RequestLogs } from './pages/RequestLogs';
import { HealthMonitor } from './pages/HealthMonitor';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <BrowserRouter>
                <Routes>
                  {/* Public Setup & Login Pages */}
                  <Route path="/setup" element={<Setup />} />
                  <Route path="/login" element={<Login />} />

                  {/* Protected Application Layout & Pages */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Overview />} />
                    <Route path="providers" element={<Providers />} />
                    <Route path="credentials" element={<Credentials />} />
                    <Route path="models" element={<Models />} />
                    <Route path="routing" element={<Routing />} />
                    <Route path="fallback-recovery" element={<FallbackRecovery />} />
                    <Route path="playground" element={<Playground />} />
                    <Route path="api-keys" element={<ApiKeys />} />
                    <Route path="keys" element={<Navigate to="/api-keys" replace />} />
                    <Route path="api-docs" element={<ApiDocs />} />
                    <Route path="docs" element={<Navigate to="/api-docs" replace />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="request-logs" element={<RequestLogs />} />
                    <Route path="health-monitor" element={<HealthMonitor />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
