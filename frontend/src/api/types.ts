// Everything in this file is type-only: `import type` guarantees the schemas (and
// zod with them) never reach the browser bundle.
import type { z } from 'zod';
import type {
  DesktopItemSchema,
  DesktopItemsSchema,
  FavoritesSchema,
  NotePageSchema,
  NoteRevisionSchema,
  NotepadSessionSchema,
  NoteSchema,
  SortOrderSchema,
  StickyPageSchema,
  StickySchema,
  UserSchema,
} from '@note/shared/schemas';

/**
 * UI-facing types are inferred from the shared schemas, which are also what the
 * backend validates. A column rename therefore breaks `npm run lint` here instead
 * of failing at runtime in a browser.
 */
export type Note = z.infer<typeof NoteSchema>;
export type NoteRevision = z.infer<typeof NoteRevisionSchema>;
export type NotePage = z.infer<typeof NotePageSchema>;
export type Sticky = z.infer<typeof StickySchema>;
export type StickyPage = z.infer<typeof StickyPageSchema>;
export type DesktopItem = z.infer<typeof DesktopItemSchema>;
export type DesktopItems = z.infer<typeof DesktopItemsSchema>;
export type Favorites = z.infer<typeof FavoritesSchema>;
export type NotepadSession = z.infer<typeof NotepadSessionSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
export type AuthUser = z.infer<typeof UserSchema>;
