/**
 * Optional daily reminder: opt-in, quiet (a bundled silent sound), at a local time the player picks.
 * Only available in the iOS app.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { hasPlugin, isNative } from './platform';

const REMINDER_ID = 4101;

export function remindersAvailable(): boolean {
  return isNative() && hasPlugin('LocalNotifications');
}

/** Returns false if the player declined notification permission. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<boolean> {
  if (!remindersAvailable()) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: 'Today’s puzzle is ready',
          body: 'A new cat-and-dog board is waiting for you.',
          schedule: { on: { hour, minute }, allowWhileIdle: true },
          sound: 'silent.wav',
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelDailyReminder(): Promise<void> {
  if (!remindersAvailable()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* ignore */
  }
}
