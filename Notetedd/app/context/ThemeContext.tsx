import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

type ThemeType = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeType;
  setTheme: (mode: ThemeType) => void;
  colors: {
    background: string;
    card: string;
    text: string;
    subtext: string;
    border: string;
    primary: string;
    secondary: string;
    error: string;
    success: string;
    warning: string;
    surface: string;
    overlay: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@app_theme_preference';

export const lightColors = {
  background: '#FFFFFF',
  card: '#F9FAFB',
  text: '#1F2937',
  subtext: '#6B7280',
  border: '#E5E7EB',
  primary: '#9B5DE5',
  secondary: '#7C3AED',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  surface: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

export const darkColors = {
  background: '#111827',
  card: '#1F2937',
  text: '#F9FAFB',
  subtext: '#9CA3AF',
  border: '#374151',
  primary: '#9B5DE5',
  secondary: '#7C3AED',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  surface: '#1F2937',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeMode, setThemeMode] = useState<ThemeType>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() || 'light'
  );

  // Load saved theme preference
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Listen to system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemTheme(colorScheme || 'light');
    });

    return () => subscription.remove();
  }, []);

  const loadThemePreference = async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
        setThemeMode(saved as ThemeType);
      }
    } catch (error) {
      console.log('Error loading theme preference:', error);
    }
  };

  const setTheme = async (mode: ThemeType) => {
    try {
      setThemeMode(mode);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.log('Error saving theme preference:', error);
    }
  };

  // Determine the actual theme to use
  const actualTheme = themeMode === 'system' ? systemTheme : themeMode;
  const colors = actualTheme === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{
        theme: actualTheme,
        themeMode,
        setTheme,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default { ThemeProvider , useTheme };