import en from './en.json';
import uk from './uk.json';
import de from './de.json';
import es from './es.json';

export { en, uk, de, es };

export const resources = {
  en: { translation: en },
  uk: { translation: uk },
  de: { translation: de },
  es: { translation: es },
} as const;

export const supportedLngs = ['en', 'uk', 'de', 'es'] as const;
export type SupportedLng = typeof supportedLngs[number];

// Re-export English type for TypeScript key inference
export type Translation = typeof en;
