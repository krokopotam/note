-- Folder „Gry" na pulpitach założonych wcześniej.
--
-- Siedem gierek nie może wejść na pasek ani do rzędu ikon — przykryłyby aplikacje,
-- dla których ten pulpit istnieje. Trafiają więc do jednego foldera, dokładnie tak
-- jak dostaje je nowe konto w repos/seed.js.
--
-- Folder ląduje w wolnym wierszu (pod ostatnią rzeczą na pulpicie), żeby nie wejść
-- na nic, co użytkownik sam postawił. Konta bez własnych ikon są pomijane — te
-- zakłada CLI i dostaje wszystko z repos/seed.js.

INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
SELECT u.id, 'folder', 'Gry', NULL, NULL, 3,
       (
         SELECT COALESCE(MAX(d.y), -1) + 1
           FROM desktop_items d
          WHERE d.user_id = u.id AND d.parent_id IS NULL
       ),
       '2026-01-01T00:00:00.000Z'
  FROM users u
 WHERE NOT EXISTS (
         SELECT 1 FROM desktop_items d
          WHERE d.user_id = u.id AND d.kind = 'folder' AND d.name = 'Gry'
       )
   AND EXISTS (SELECT 1 FROM desktop_items d WHERE d.user_id = u.id);

INSERT INTO desktop_items (user_id, kind, name, app_id, parent_id, x, y, created_at)
SELECT f.user_id, 'app', g.title, g.id, f.id, g.x, g.y, '2026-01-01T00:00:00.000Z'
  FROM desktop_items f
 CROSS JOIN (
         SELECT 'snake'       AS id, 'Wężyk'          AS title, 0 AS x, 0 AS y
   UNION ALL SELECT 'tetris'              , 'Tetris'          , 1   , 0
   UNION ALL SELECT 'bubbles'             , 'Bąbelki'         , 2   , 0
   UNION ALL SELECT 'twentyforty'         , '2048'            , 3   , 0
   UNION ALL SELECT 'mines'               , 'Saper'           , 0   , 1
   UNION ALL SELECT 'memory'              , 'Pamięć'          , 1   , 1
   UNION ALL SELECT 'tictactoe'           , 'Kółko i krzyżyk' , 2   , 1
 ) g
 WHERE f.kind = 'folder' AND f.name = 'Gry'
   AND NOT EXISTS (
         SELECT 1 FROM desktop_items d
          WHERE d.user_id = f.user_id AND d.app_id = g.id
       );
