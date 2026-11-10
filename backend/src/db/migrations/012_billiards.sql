-- Bilard dla kont, które mają już folder „Gry".
--
-- Dwie nowe gierki (2D i 3D) nie mogą wejść na pasek ani na pulpit — leżą w folderze
-- z pozostałymi, dokładnie tak jak dostaje je nowe konto w repos/seed.js.
--
-- Miejsce liczy się od liczby dzieci w folderze, a nie ze sztywnego współrzędnych:
-- konto mogło samo coś w tym folderze poprzesuwać, a siatka ma cztery kolumny
-- (x = liczba % 4, y = liczba / 4) — tak samo jak w seedzie.

WITH free AS (
  SELECT f.id AS folder_id, f.user_id,
         (SELECT COUNT(*) FROM desktop_items c WHERE c.parent_id = f.id) AS slots
    FROM desktop_items f
   WHERE f.kind = 'folder' AND f.name = 'Gry'
)
INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
SELECT free.user_id, 'app', g.title, g.id, free.folder_id,
       (free.slots + g.ord) % 4, (free.slots + g.ord) / 4,
       '2026-01-01T00:00:00.000Z'
  FROM free
 CROSS JOIN (
         SELECT 'billiard2d' AS id, 'Bilard 2D' AS title, 0 AS ord
   UNION ALL SELECT 'billiard3d'            , 'Bilard 3D'           , 1
 ) g
 WHERE NOT EXISTS (
         SELECT 1 FROM desktop_items d
          WHERE d.user_id = free.user_id AND d.app_id = g.id
       );
