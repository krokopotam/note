-- Ikona „Czaty\" na pulpitach założonych wcześniej.
--
-- Pulpit jest jedynym wejściem do aplikacji, więc konto poukładane przed powstaniem
-- czatów nie miałoby czym otworzyć okna. Ten sam zabieg co dla „Pliki\" (004):
-- ikona pod ostatnią inną ikoną i slot na końcu obu pasków.
--
-- Konta bez własnych ikon są pomijane — te zakłada CLI i dostaje wszystko z
-- repos/seed.js.

INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
SELECT u.id, 'app', 'Czaty', 'chat', NULL, 0,
       (
         SELECT COALESCE(MAX(d.y), -1) + 1
           FROM desktop_items d
          WHERE d.user_id = u.id AND d.kind = 'app' AND d.parent_id IS NULL
       ),
       '2026-01-01T00:00:00.000Z'
  FROM users u
 WHERE NOT EXISTS (
         SELECT 1 FROM desktop_items d WHERE d.user_id = u.id AND d.app_id = 'chat'
       )
   AND EXISTS (SELECT 1 FROM desktop_items d WHERE d.user_id = u.id);

INSERT INTO favorites (user_id, slot, app_id, position)
SELECT u.id, bar.slot, 'chat',
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
          WHERE f.user_id = u.id AND f.slot = bar.slot AND f.app_id = 'chat'
       );
