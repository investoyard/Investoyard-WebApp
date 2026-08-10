import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback, fire-and-forget. Wrapped so a platform without an engine
 * (web preview, some emulators) can never throw into UI code.
 */
export const tapLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const tapSelect = () => { Haptics.selectionAsync().catch(() => {}); };
export const tapSuccess = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
