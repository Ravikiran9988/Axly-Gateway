import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App Root Component', () => {
  it('renders application without crashing', () => {
    render(<App />);
    // Initial load checks setup or login state
    expect(document.body).toBeInTheDocument();
  });
});
