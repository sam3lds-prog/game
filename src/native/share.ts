import { Share } from '@capacitor/share';
import { hasPlugin, isNative } from './platform';

/** Share sheet on iPhone; Web Share or clipboard in browsers. Returns false if nothing happened. */
export async function shareText(text: string): Promise<boolean> {
  try {
    if (isNative() && hasPlugin('Share')) {
      await Share.share({ text });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
