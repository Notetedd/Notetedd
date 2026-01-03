

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Safe haptic feedback that only runs on native platforms
 */
export const haptics = {
  impact: async (style = 'Medium') => {
    if (Platform.OS === 'web') return;
    
    try {
      const styles = {
        Light: Haptics.ImpactFeedbackStyle.Light,
        Medium: Haptics.ImpactFeedbackStyle.Medium,
        Heavy: Haptics.ImpactFeedbackStyle.Heavy,
      };
      await Haptics.impactAsync(styles[style] || styles.Medium);
    } catch (error) {
      // Silently fail - haptics are enhancement, not critical
      console.debug('Haptics not available:', error.message);
    }
  },

  notification: async (type = 'Success') => {
    if (Platform.OS === 'web') return;
    
    try {
      const types = {
        Success: Haptics.NotificationFeedbackType.Success,
        Warning: Haptics.NotificationFeedbackType.Warning,
        Error: Haptics.NotificationFeedbackType.Error,
      };
      await Haptics.notificationAsync(types[type] || types.Success);
    } catch (error) {
      console.debug('Haptics not available:', error.message);
    }
  },

  selection: async () => {
    if (Platform.OS === 'web') return;
    
    try {
      await Haptics.selectionAsync();
    } catch (error) {
      console.debug('Haptics not available:', error.message);
    }
  },
};

export default haptics;