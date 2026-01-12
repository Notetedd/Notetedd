// services/RevenueCatService.js
import Purchases from 'react-native-purchases';
import { ENTITLEMENT_ID } from '../../RevenueCatConfig';

/**
 * Check if user has active pro subscription
 */
export const checkProStatus = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isProActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    
    return {
      isPro: isProActive,
      customerInfo,
      activeSubscriptions: Object.keys(customerInfo.entitlements.active),
    };
  } catch (error) {
    console.error('❌ Error checking pro status:', error);
    return {
      isPro: false,
      customerInfo: null,
      activeSubscriptions: [],
    };
  }
};

/**
 * Get available offerings (subscription packages)
 */
export const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    
    if (!offerings.current) {
      console.warn('⚠️ No current offering available');
      return null;
    }

    // Current offering contains all available packages
    const currentOffering = offerings.current;
    
    // Extract packages by type
    const packages = {
      monthly: currentOffering.monthly,
      threeMonth: currentOffering.threeMonth,
      annual: currentOffering.annual,
      lifetime: currentOffering.lifetime,
      all: currentOffering.availablePackages,
    };

    return {
      offering: currentOffering,
      packages,
    };
  } catch (error) {
    console.error('❌ Error fetching offerings:', error);
    return null;
  }
};

/**
 * Purchase a package
 */
export const purchasePackage = async (packageToPurchase) => {
  try {
    const { customerInfo, productIdentifier } = await Purchases.purchasePackage(packageToPurchase);
    
    const isProActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    
    return {
      success: true,
      isPro: isProActive,
      customerInfo,
      productIdentifier,
    };
  } catch (error) {
    if (error.userCancelled) {
      console.log('ℹ️ User cancelled purchase');
      return {
        success: false,
        cancelled: true,
        error: 'User cancelled',
      };
    }
    
    console.error('❌ Error purchasing package:', error);
    return {
      success: false,
      cancelled: false,
      error: error.message || 'Purchase failed',
    };
  }
};

/**
 * Restore purchases
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isProActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    
    return {
      success: true,
      isPro: isProActive,
      customerInfo,
      hasActiveSubscription: Object.keys(customerInfo.entitlements.active).length > 0,
    };
  } catch (error) {
    console.error('❌ Error restoring purchases:', error);
    return {
      success: false,
      error: error.message || 'Restore failed',
    };
  }
};

/**
 * Get customer info
 */
export const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    
    // Parse subscription details
    const activeEntitlements = customerInfo.entitlements.active;
    const isPro = activeEntitlements[ENTITLEMENT_ID] !== undefined;
    
    let subscriptionInfo = null;
    if (isPro) {
      const entitlement = activeEntitlements[ENTITLEMENT_ID];
      subscriptionInfo = {
        productIdentifier: entitlement.productIdentifier,
        expirationDate: entitlement.expirationDate,
        isActive: entitlement.isActive,
        willRenew: entitlement.willRenew,
        periodType: entitlement.periodType,
        store: entitlement.store,
      };
    }
    
    return {
      isPro,
      subscriptionInfo,
      originalAppUserId: customerInfo.originalAppUserId,
      allPurchasedProductIdentifiers: customerInfo.allPurchasedProductIdentifiers,
      latestExpirationDate: customerInfo.latestExpirationDate,
    };
  } catch (error) {
    console.error('❌ Error getting customer info:', error);
    return null;
  }
};

/**
 * Check if user is subscribed to a specific product
 */
export const isSubscribedToProduct = async (productId) => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.allPurchasedProductIdentifiers.includes(productId);
  } catch (error) {
    console.error('❌ Error checking product subscription:', error);
    return false;
  }
};

/**
 * Get subscription expiration info
 */
export const getSubscriptionExpiration = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const proEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
    
    if (!proEntitlement) {
      return null;
    }
    
    return {
      expirationDate: proEntitlement.expirationDate,
      willRenew: proEntitlement.willRenew,
      unsubscribeDetectedAt: proEntitlement.unsubscribeDetectedAt,
      billingIssueDetectedAt: proEntitlement.billingIssueDetectedAt,
    };
  } catch (error) {
    console.error('❌ Error getting subscription expiration:', error);
    return null;
  }
};

/**
 * Check for promotional offers eligibility
 */
export const checkPromotionalOfferEligibility = async (productIds) => {
  try {
    if (Platform.OS !== 'ios') {
      return null; // Promotional offers are iOS only
    }
    
    const eligibility = await Purchases.checkPromotionalDiscountEligibility(productIds);
    return eligibility;
  } catch (error) {
    console.error('❌ Error checking promotional offer eligibility:', error);
    return null;
  }
};