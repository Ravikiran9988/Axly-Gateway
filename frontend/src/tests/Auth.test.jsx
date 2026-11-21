import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Setup } from '../pages/Setup';
import { Login } from '../pages/Login';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';

describe('Authentication UI States', () => {
  it('renders setup form with email, password, and confirm password fields', () => {
    render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Setup />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('First-Run System Setup')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@yourdomain.local')).toBeInTheDocument();
    expect(screen.getByText('Initialize Gateway')).toBeInTheDocument();
  });

  it('renders administrator login form', () => {
    render(
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('Administrator Login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@yourdomain.local')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });
});
