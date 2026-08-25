import { Injectable, Logger } from '@nestjs/common';
import { assertPublicUrl } from '@household/common';

export interface LinkPreview {
  imageUrl: string | null;
  previewTitle: string | null;
}

// Only the <head> ever holds OG/Twitter Card tags — capping how much of the
// body we read keeps a multi-gigabyte or infinite response from tying up
// this request (the fetch has a timeout too, but that doesn't bound bytes
// already in flight when it fires).
const MAX_HTML_BYTES = 200_000;
const FETCH_TIMEOUT_MS = 5_000;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(amp|quot|#39|apos|lt|gt);/g,
    (m) => HTML_ENTITIES[m] ?? m,
  );
}

function extractMetaContent(html: string, name: string): string | null {
  const attr = String.raw`(?:property|name)=["']${name}["']`;
  const content = String.raw`content=["']([^"']*)["']`;
  const propertyFirst = new RegExp(`<meta[^>]*${attr}[^>]*${content}`, 'i');
  const contentFirst = new RegExp(`<meta[^>]*${content}[^>]*${attr}`, 'i');
  const match = html.match(propertyFirst) ?? html.match(contentFirst);
  return match ? decodeEntities(match[1]) : null;
}

/**
 * Best-effort Open Graph / Twitter Card metadata fetch for a user-supplied
 * product URL (#197). Two distinct failure modes on purpose:
 *  - An unsafe target (SSRF) throws — assertPublicUrl's BadRequestException
 *    propagates and blocks the whole create/update, not just the preview.
 *  - Anything else (unreachable, timeout, non-200, no OG tags) is non-fatal:
 *    resolves to nulls so a broken preview never blocks adding the product.
 */
@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  async fetchPreview(url: string): Promise<LinkPreview> {
    await assertPublicUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) return { imageUrl: null, previewTitle: null };

      const html = await this.readCapped(res.body);
      return {
        previewTitle:
          extractMetaContent(html, 'og:title') ??
          extractMetaContent(html, 'twitter:title'),
        imageUrl:
          extractMetaContent(html, 'og:image') ??
          extractMetaContent(html, 'twitter:image'),
      };
    } catch (err) {
      this.logger.warn(
        `Link preview fetch failed for ${url}: ${(err as Error).message}`,
      );
      return { imageUrl: null, previewTitle: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readCapped(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    try {
      while (html.length < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return html;
  }
}
