/**
 * Share / download / copy a DOM node rendered to PNG.
 *
 * Strategy:
 *   1. Try the Web Share API (`navigator.canShare({ files })`) — preferred on
 *      mobile because it surfaces the native share sheet (Telegram, Messages,
 *      WhatsApp, AirDrop…).
 *   2. Fall back to writing the PNG to the clipboard on desktop (Chrome/Safari
 *      have ClipboardItem support).
 *   3. Last resort: trigger a file download via an anchor tag.
 *
 * Caller picks the action via the `mode` argument; `auto` chooses sensibly.
 */

import { toBlob } from 'html-to-image';
import { copyImageBlob } from './clipboard';

export type ShareMode = 'auto' | 'share' | 'copy' | 'download';

export type ShareResultKind = 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed';

export interface ShareResult {
  kind: ShareResultKind;
  /** Human-readable reason, populated on `failed` / `cancelled`. */
  detail?: string;
}

export interface ShareOptions {
  /** Filename used for downloads + share-sheet metadata. */
  filename?: string;
  /** Title used in the share sheet. */
  title?: string;
  /** Text caption included alongside the image in the share sheet. */
  text?: string;
  /** Force a particular delivery mode. Default: 'auto'. */
  mode?: ShareMode;
  /** Pixel ratio for the rendered PNG. Default: 2 (retina-quality). */
  pixelRatio?: number;
}

const DEFAULT_FILENAME = 'settle-poker-now.png';

export async function renderNodeToBlob(
  node: HTMLElement,
  opts: { pixelRatio?: number } = {}
): Promise<Blob> {
  const { pixelRatio = 2 } = opts;
  const blob = await toBlob(node, {
    pixelRatio,
    cacheBust: true,
    backgroundColor: undefined,
    style: {
      // html-to-image inherits computed styles; we override transforms that
      // could push the rendered region off-canvas.
      transform: 'none',
    },
  });
  if (!blob) throw new Error('html-to-image produced an empty blob');
  return blob;
}

function detectIsMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function canUseShareWithFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after the download has had a chance to start. 1s is generous.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareNodeAsImage(
  node: HTMLElement,
  opts: ShareOptions = {}
): Promise<ShareResult> {
  const filename = opts.filename ?? DEFAULT_FILENAME;
  const mode: ShareMode = opts.mode ?? 'auto';

  let blob: Blob;
  try {
    blob = await renderNodeToBlob(node, { pixelRatio: opts.pixelRatio ?? 2 });
  } catch (err) {
    return { kind: 'failed', detail: (err as Error).message };
  }

  const file = new File([blob], filename, { type: 'image/png' });

  // 1) Web Share API path — best on mobile.
  if (mode === 'share' || (mode === 'auto' && detectIsMobile())) {
    if (canUseShareWithFiles([file])) {
      try {
        await navigator.share({
          files: [file],
          title: opts.title,
          text: opts.text,
        });
        return { kind: 'shared' };
      } catch (err) {
        const e = err as DOMException;
        if (e?.name === 'AbortError') {
          return { kind: 'cancelled' };
        }
        // Fall through to clipboard / download.
      }
    }
  }

  // 2) Clipboard path — best on desktop.
  if (mode === 'copy' || mode === 'auto') {
    const ok = await copyImageBlob(blob);
    if (ok) return { kind: 'copied' };
    if (mode === 'copy') {
      // Caller asked for clipboard explicitly and we couldn't deliver.
      return { kind: 'failed', detail: 'Clipboard image write unsupported in this browser' };
    }
  }

  // 3) Download fallback — universally supported.
  try {
    downloadBlob(blob, filename);
    return { kind: 'downloaded' };
  } catch (err) {
    return { kind: 'failed', detail: (err as Error).message };
  }
}
