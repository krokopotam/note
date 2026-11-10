-- An application that arrived after the first accounts existed.
--
-- The desktop is the only door to an app, so an account whose icons were laid out
-- before "Pliki" was written would have no way to open it. Every desktop gets the
-- icon under its last one, and both quick bars get a slot at the end.
--
-- Accounts with no icons of their own are skipped: those are created by the CLI and
-- get everything from repos/seed.js instead.

INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
SELECT u.id, 'app', 'Pliki', 'files', NULL, 0,
       (
         SELECT COALESCE(MAX(d.y), -1) + 1
           FROM desktop_items d
          WHERE d.user_id = u.id AND d.kind = 'app' AND d.parent_id IS NULL
       ),
       '2026-01-01T00:00:00.000Z'
  FROM users u
 WHERE NOT EXISTS (
         SELECT 1 FROM desktop_items d WHERE d.user_id = u.id AND d.app_id = 'files'
       )
   AND EXISTS (SELECT 1 FROM desktop_items d WHERE d.user_id = u.id);

INSERT INTO favorites (user_id, slot, app_id, position)
SELECT u.id, bar.slot, 'files',
       (
         SELECT COALESCE(MAX(f.position), -1) + 1
           FROM favorites f
          WHERE f.user_id = u.id AND f.slot = bar.slot
       )
  FROM users u
 CROSS JOIN (SELECT 'dock' AS slot UNION ALL SELECT 'launcher') AS bar
 WHERE EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = u.id AND f.slot = bar.slot)
   AND NOT EXISTS (
         SELECT 1 FROM favorites f
          WHERE f.user_id = u.id AND f.slot = bar.slot AND f.app_id = 'files'
       );
