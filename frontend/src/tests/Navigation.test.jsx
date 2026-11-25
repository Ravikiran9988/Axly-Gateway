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
      'Dashboard',
      'Routing',
      'Providers',
      'API Keys',
      'Playground',
      'Request Logs',
      'Analytics',
      'Settings',
    ];

    expect(navigationItems).toHaveLength(8);

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

    expect(screen.getByText(/One API. Intelligent Routing. Zero-Downtime Failover./i)).toBeInTheDocument();
  });
});
