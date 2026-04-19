

import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const SidebarContext = createContext(null);

export function SidebarProvider({ children, navigationRef }) {
  const [isOpen, setIsOpen] = useState(false);

  // I store the navigationRef so the Sidebar component can navigate
  // without needing to receive navigation as a prop.
  const navRef = navigationRef;

  const openSidebar  = useCallback(() => setIsOpen(true),  []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);
  const toggleSidebar = useCallback(() => setIsOpen(v => !v), []);

  return (
    <SidebarContext.Provider value={{ isOpen, openSidebar, closeSidebar, toggleSidebar, navRef }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used inside <SidebarProvider>');
  }
  return ctx;
}