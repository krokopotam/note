/**
 * Who may do what with a resource.
 *
 * Three roles, one rule each: `read` sees and downloads, `edit` also uploads,
 * renames and deletes, `owner` additionally renames the resource, shares it and
 * destroys it. The owner is the `owner_id` column and never needs a member row.
 */

export const ROLE = { owner: 'owner', edit: 'edit', read: 'read' };

export const canRead = (role) => role === ROLE.owner || role === ROLE.edit || role === ROLE.read;
export const canEdit = (role) => role === ROLE.owner || role === ROLE.edit;
export const owns = (role) => role === ROLE.owner;

/**
 * A role is never trusted from the client: it is always derived here from the
 * database, so a request cannot grant itself `edit` by sending a field.
 *
 * @param {boolean} isOwner
 * @param {'read'|'edit'|null|undefined} membership
 * @returns {'owner'|'edit'|'read'|null}
 */
export function roleFor(isOwner, membership) {
  if (isOwner) return ROLE.owner;
  if (membership === 'edit') return ROLE.edit;
  if (membership === 'read') return ROLE.read;
  return null;
}
