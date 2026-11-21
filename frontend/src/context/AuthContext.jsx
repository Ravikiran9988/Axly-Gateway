import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import { apiClient } from '../api/client';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [isSetupRequired, setIsSetupRequired] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const statusData = await authApi.getSetupStatus();
      setIsSetupRequired(statusData.is_setup_required);

      if (!statusData.is_setup_required && apiClient.getToken()) {
        try {
          const profile = await authApi.getMe();
          setAdmin(profile);
        } catch (err) {
          apiClient.setToken(null);
          setAdmin(null);
        }
      }
    } catch (err) {
      console.error('Failed to load gateway status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const login = async (email, password) => {
    const data = await authApi.login(email, password);
    const profile = await authApi.getMe();
    setAdmin(profile);
    return data;
  };

  const logout = async () => {
    await authApi.logout();
    setAdmin(null);
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        isAuthenticated: !!admin,
        isSetupRequired,
        isLoading,
        login,
        logout,
        checkStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
