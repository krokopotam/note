// Everything in this file is type-only: `import type` guarantees the schemas (and
// zod with them) never reach the browser bundle.
import type { z } from 'zod';
import type {
  ChatPeerSchema,
  ConversationListSchema,
  ConversationSchema,
  DesktopItemSchema,
  DesktopItemsSchema,
  FilePageSchema,
  FileResourceSchema,
  FileSchema,
  FavoritesSchema,
  MessagePageSchema,
  MessageSchema,
  NotePageSchema,
  NoteRevisionSchema,
  NotepadSessionSchema,
  NoteSchema,
  ResourceDetailSchema,
  ResourceMemberSchema,
  ShareableUsersSchema,
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
export type FileResource = z.infer<typeof FileResourceSchema>;
export type FileEntry = z.infer<typeof FileSchema>;
export type FilePage = z.infer<typeof FilePageSchema>;
export type ResourceMember = z.infer<typeof ResourceMemberSchema>;
export type ResourceDetail = z.infer<typeof ResourceDetailSchema>;
export type ShareableUsers = z.infer<typeof ShareableUsersSchema>;

/** 'owner' — theirs; 'edit' — may upload/rename/delete; 'read' — may only take. */
export type ResourceRole = FileResource['role'];
export type ChatPeer = z.infer<typeof ChatPeerSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type MessagePage = z.infer<typeof MessagePageSchema>;
