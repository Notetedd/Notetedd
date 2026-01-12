// context/SubscriptionContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from './../../RevenueCatConfig';
import { checkProStatus, getCustomerInfo } from '../services/RevenueCatService';



// Create the context with default values
const SubscriptionContext = createContext({
  isPro: false,
  customerInfo: null,
  subscriptionInfo: null,
  isLoading: true,
  refresh: async () => {},
  isSubscribed: false,
  hasActiveSubscription: false,
});

export const SubscriptionProvider = ({ children }) => {
  const [isPro, setIsPro] = useState(false);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  // Check subscription status on mount
  useEffect(() => {
    checkSubscriptionStatus();
    setupPurchaseListeners();
    
    return () => {
      // Cleanup listeners
      try {
        Purchases.removeCustomerInfoUpdateListener();
      } catch (error) {
        console.log('Error removing listener:', error);
      }
    };
  }, []);

  /**
   * Check current subscription status
   */
  const checkSubscriptionStatus = async () => {
    try {
      setIsLoading(true);
      const info = await Purchases.getCustomerInfo();
      const proActive = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
      
      setIsPro(proActive);
      setCustomerInfo(info);
      
      // Get detailed subscription info
      if (proActive) {
        const entitlement = info.entitlements.active[ENTITLEMENT_ID];
        setSubscriptionInfo({
          productIdentifier: entitlement.productIdentifier,
          expirationDate: entitlement.expirationDate,
          isActive: entitlement.isActive,
          willRenew: entitlement.willRenew,
          periodType: entitlement.periodType,
          store: entitlement.store,
        });
      } else {
        setSubscriptionInfo(null);
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      // Set defaults on error
      setIsPro(false);
      setCustomerInfo(null);
      setSubscriptionInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Setup listeners for purchase updates
   */
  const setupPurchaseListeners = () => {
    try {
      // Listen for customer info updates
      Purchases.addCustomerInfoUpdateListener((info) => {
        const proActive = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
        setIsPro(proActive);
        setCustomerInfo(info);
        
        // Update subscription info
        if (proActive) {
          const entitlement = info.entitlements.active[ENTITLEMENT_ID];
          setSubscriptionInfo({
            productIdentifier: entitlement.productIdentifier,
            expirationDate: entitlement.expirationDate,
            isActive: entitlement.isActive,
            willRenew: entitlement.willRenew,
            periodType: entitlement.periodType,
            store: entitlement.store,
          });
        } else {
          setSubscriptionInfo(null);
        }
        
        console.log('📱 Customer info updated:', { isPro: proActive });
      });
    } catch (error) {
      console.error('Error setting up listeners:', error);
    }
  };

  /**
   * Refresh subscription status manually
   */
  const refresh = async () => {
    await checkSubscriptionStatus();
  };

  const value = {
    isPro,
    customerInfo,
    subscriptionInfo,
    isLoading,
    refresh,
    // Computed values
    isSubscribed: isPro,
    hasActiveSubscription: isPro,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

/**
 * Hook to use subscription context
 */
export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};

export default SubscriptionContext;