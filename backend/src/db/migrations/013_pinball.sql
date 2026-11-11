-- Pinball dla kont, które mają już folder „Gry".
--
-- Jedna nowa gierka, na tych samych zasadach co bilard w migracji 012: leży w
-- folderze z pozostałymi, nie wchodzi na pasek ani na pulpit, a nowe konto
-- dostaje ją od razu z repos/seed.js (GAMES w manifeście).
--
-- Miejsce bierze pierwsze WOLNE, a nie „liczba dzieci modulo cztery". Tamten
-- sposób z 012 działał, dopóki dokładane ikonki były zawsze na końcu; tu w
-- folderze może już stać coś, co przyszło później, i po nowemu nikt na siebie
-- nie wchodzi.

WITH folder AS (
  SELECT id AS folder_id, user_id
    FROM desktop_items
   WHERE kind = 'folder' AND name = 'Gry'
),
taken AS (
  SELECT parent_id AS folder_id, y * 4 + x AS slot
    FROM desktop_items
   WHERE parent_id IN (SELECT folder_id FROM folder)
),
cand (n) AS (
  VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9),
           (10), (11), (12), (13), (14), (15), (16), (17), (18), (19),
           (20), (21), (22), (23), (24), (25), (26), (27), (28), (29)
),
chosen AS (
  SELECT folder.folder_id, folder.user_id, MIN(cand.n) AS slot
    FROM folder
   CROSS JOIN cand
   WHERE NOT EXISTS (
         SELECT 1 FROM taken t WHERE t.folder_id = folder.folder_id AND t.slot = cand.n
       )
   GROUP BY folder.folder_id, folder.user_id
)
INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
SELECT user_id, 'app', 'Pinball', 'pinball', folder_id, slot % 4, slot / 4,
       '2026-01-01T00:00:00.000Z'
  FROM chosen;
