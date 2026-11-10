/**
 * API contracts as zod schemas: the backend validates every inbound payload with
 * these, and the frontend derives its TypeScript types from the same objects
 * (type-only imports, so nothing of zod reaches the browser).
 *
 * Column naming follows the SQLite schema (snake_case) on purpose: a DTO is a
 * direct projection of a row, so there is exactly one mapping to keep in mind.
 */
import { z } from 'zod';
import {
  DESKTOP_KINDS,
  DESKTOP_NAME_MAX,
  FAVORITE_SLOTS,
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  FILE_NAME_MAX,
  FILE_PERMISSIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  MESSAGE_MAX_LENGTH,
  RESOURCE_NAME_MAX,
  SORT_ORDERS,
  STICKY_BODY_MAX,
  STICKY_COLORS,
  USERNAME_HINT,
  USERNAME_PATTERN,
  normalizeUsername,
} from './manifest.js';

export const NoteSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const StickySchema = z.object({
  id: z.number().int(),
  body: z.string(),
  color: z.enum(STICKY_COLORS),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DesktopItemSchema = z.object({
  id: z.number().int(),
  kind: z.enum(DESKTOP_KINDS),
  name: z.string(),
  app_id: z.string().nullable(),
  parent_id: z.number().int().nullable(),
  x: z.number().int(),
  y: z.number().int(),
  created_at: z.string(),
});

/**
 * @param {z.ZodTypeAny} item
 * @returns {z.ZodObject<{items: z.ZodArray<z.ZodTypeAny>, total: z.ZodNumber}>}
 */
/** List envelopes. Written out per resource on purpose: a generic helper in a
 * plain .js file loses the item type, and these types are what the frontend
 * compiles against. */
export const NotePageSchema = z.object({
  items: z.array(NoteSchema),
  total: z.number().int(),
});

export const StickyPageSchema = z.object({
  items: z.array(StickySchema),
  total: z.number().int(),
});

export const DesktopItemsSchema = z.object({
  items: z.array(DesktopItemSchema),
});

/** Ordering values accepted by the list endpoints; the UI renders labels for these. */
export const SortOrderSchema = z.enum(SORT_ORDERS);

/** Payload for creating a note. Title falls back to the first line of the body. */
export const NoteCreateSchema = z.object({
  title: z.string().trim().min(1).max(NOTE_TITLE_MAX).optional(),
  body: z.string().max(NOTE_BODY_MAX).default(''),
});

/** Payload for patching a note; at least one field must be present. */
export const NotePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(NOTE_TITLE_MAX).optional(),
    body: z.string().max(NOTE_BODY_MAX).optional(),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: 'title or body is required',
  });

export const StickyCreateSchema = z.object({
  body: z.string().max(STICKY_BODY_MAX).default(''),
  color: z.enum(STICKY_COLORS).default('yellow'),
  pinned: z.boolean().default(false),
});

export const StickyPatchSchema = z.object({
  body: z.string().max(STICKY_BODY_MAX).optional(),
  color: z.enum(STICKY_COLORS).optional(),
  pinned: z.boolean().optional(),
});

export const DesktopItemCreateSchema = z
  .object({
    kind: z.enum(DESKTOP_KINDS),
    name: z.string().trim().min(1).max(DESKTOP_NAME_MAX),
    app_id: z.string().trim().min(1).max(60).nullable().optional(),
    parent_id: z.number().int().nonnegative().nullable().optional(),
    x: z.number().int().min(0).default(0),
    y: z.number().int().min(0).default(0),
  })
  .refine((value) => (value.kind === 'app' ? typeof value.app_id === 'string' : true), {
    message: 'app item requires app_id',
    path: ['app_id'],
  });

export const DesktopItemPatchSchema = z.object({
  name: z.string().trim().min(1).max(DESKTOP_NAME_MAX).optional(),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  parent_id: z.number().int().nonnegative().nullable().optional(),
});

export const FavoritesPutSchema = z.object({
  slot: z.enum(FAVORITE_SLOTS),
  app_ids: z.array(z.string().trim().min(1).max(60)).max(32),
});

export const FavoritesSlotSchema = z.object({
  slot: z.enum(FAVORITE_SLOTS),
  app_ids: z.array(z.string()),
});

export const FavoritesSchema = z.object({
  slots: z.array(FavoritesSlotSchema),
});

export const NotepadSessionSchema = z.object({
  tabs: z.array(z.number().int()).max(100),
  active_note_id: z.number().int().nullable().default(null),
});

// --- accounts ---------------------------------------------------------------

/** What the shell is told about the signed-in user. Never the hash, never the salt. */
export const UserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
});

/**
 * Registration: the password is typed twice, and the server checks the two agree.
 * Usernames are normalised (trim + lowercase) before the pattern is applied.
 */
export const RegisterSchema = z
  .object({
    username: z.string(),
    password: z.string().min(PASSWORD_MIN_LENGTH, `hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków`).max(PASSWORD_MAX_LENGTH, 'hasło jest za długie'),
    password_confirm: z.string(),
    remember: z.boolean().optional().default(false),
  })
  .transform((value) => ({ ...value, username: normalizeUsername(value.username) }))
  .refine((value) => USERNAME_PATTERN.test(value.username), {
    message: USERNAME_HINT,
    path: ['username'],
  })
  .refine((value) => value.password === value.password_confirm, {
    message: 'hasła różnią się',
    path: ['password_confirm'],
  });

/** Login. No minimum password length here: a short one must fail on the hash, not on the schema. */
export const LoginSchema = z
  .object({
    username: z.string(),
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    remember: z.boolean().optional().default(false),
  })
  .transform((value) => ({ ...value, username: normalizeUsername(value.username) }));

/**
 * Shared list query contract: `q` is a keyword search, `sort` maps to a fixed
 * ORDER BY in SQL, `limit`/`offset` paginate.
 */
export const ListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(SORT_ORDERS).default('updated_desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** `?pinned=true` filter of the stickies list. Explicit strings: z.coerce.boolean() would accept "false". */
export const PinnedOnlySchema = z.enum(['true', 'false']).default('false');

/** Uniform error body so the UI can render failures without special-casing routes. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

// --- pliki ------------------------------------------------------------------

/** A resource ("zasób"): a named folder of files, owned by one account. */
export const FileResourceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** What the *requesting* user may do here: owner is 'edit' plus sharing rights. */
  role: z.enum(['owner', 'edit', 'read']),
  file_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const FileResourcePageSchema = z.object({ items: z.array(FileResourceSchema) });

export const FileResourceCreateSchema = z.object({
  name: z.string().trim().min(1).max(RESOURCE_NAME_MAX),
});

export const FileResourcePatchSchema = z.object({
  name: z.string().trim().min(1).max(RESOURCE_NAME_MAX),
});

export const FileSchema = z.object({
  id: z.number().int(),
  resource_id: z.number().int(),
  name: z.string(),
  size: z.number().int(),
  content_type: z.string(),
  /** null when the account that uploaded it is gone — the file itself stays. */
  created_by: z.number().int().nullable(),
  created_by_name: z.string(),
  created_at: z.string(),
});

export const FilePageSchema = z.object({ items: z.array(FileSchema) });

/** Rename only — the bytes never change identity, only their label. */
export const FilePatchSchema = z.object({
  name: z.string().trim().min(1).max(FILE_NAME_MAX),
});

/**
 * Sharing one resource with one account. `permission: null` takes it away again.
 * The list of people who may be shared with comes from the users table.
 */
export const ResourceMemberPutSchema = z.object({
  user_id: z.number().int(),
  permission: z.enum(FILE_PERMISSIONS).nullable(),
});

export const ResourceMemberSchema = z.object({
  user_id: z.number().int(),
  username: z.string(),
  permission: z.enum(FILE_PERMISSIONS),
});

export const ResourceDetailSchema = z.object({
  resource: FileResourceSchema,
  members: z.array(ResourceMemberSchema),
});

/** Who can be picked in the sharing dialog (usernames only, no hashes). */
export const ShareableUsersSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), username: z.string() })),
});

// --- czaty ------------------------------------------------------------------

/** The other person of a conversation; null when their account was removed. */
export const ChatPeerSchema = z.object({ id: z.number().int(), username: z.string() });

/**
 * One row of the conversation list: who, what was said last and how much of it
 * is still unread. Everything the sidebar needs in a single query.
 */
export const ConversationSchema = z.object({
  id: z.number().int(),
  peer: ChatPeerSchema.nullable(),
  last_body: z.string().nullable(),
  last_at: z.string().nullable(),
  last_from_me: z.boolean(),
  unread: z.number().int(),
  created_at: z.string(),
});

export const ConversationListSchema = z.object({ items: z.array(ConversationSchema) });

export const ConversationCreateSchema = z.object({ user_id: z.number().int() });

export const MessageSchema = z.object({
  id: z.number().int(),
  conversation_id: z.number().int(),
  /** null when the author's account is gone — the message itself stays. */
  author_id: z.number().int().nullable(),
  author_name: z.string(),
  body: z.string(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  /** When editing stops being possible; null for somebody else's message. */
  editable_until: z.string().nullable(),
  /** Decided by the server — the client only draws what it is told. */
  can_edit: z.boolean(),
});

export const MessagePageSchema = z.object({ items: z.array(MessageSchema) });

/** Send and edit share one rule: a message is non-empty text with a ceiling. */
const MessageBodySchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export const MessageCreateSchema = MessageBodySchema;
export const MessagePatchSchema = MessageBodySchema;

/**
 * Validate inbound data or throw an error the middleware turns into the uniform
 * error body. Keeps route handlers free of branching.
 *
 * @param {z.ZodTypeAny} schema
 * @param {unknown} data
 * @param {string} code - error code reported to the client
 * @returns {any} parsed data
 */
export function parseOrThrow(schema, data, code = 'validation_error') {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  const error = new Error(details[0]?.message ?? 'invalid payload');
  error.code = code;
  error.status = 400;
  error.details = details;
  throw error;
}
