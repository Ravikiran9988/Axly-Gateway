import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Sidebar, navigationItems } from '../components/layout/Sidebar';
import { ThemeProvider } from '../context/ThemeContext';

describe('Navigation & Sidebar Component', () => {
  it('renders all required navigation links', () => {
    render(
      <BrowserRouter>
        <ThemeProvider>
          <Sidebar />
        </ThemeProvider>
      </BrowserRouter>
    );

    const expectedLabels = [
      'Overview',
      'Providers',
      'Credentials',
      'Models',
      'Routing',
      'Fallback & Recovery',
      'Playground',
      'API Keys',
      'API Documentation',
      'Analytics',
      'Request Logs',
      'Health Monitor',
      'Settings',
    ];

    expect(navigationItems).toHaveLength(13);

    expectedLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('displays branding tagline', () => {
    render(
      <BrowserRouter>
        <ThemeProvider>
          <Sidebar />
        </ThemeProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/One API. Intelligent Routing. Reliable Failover./i)).toBeInTheDocument();
  });
});
