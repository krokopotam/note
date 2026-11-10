-- Historia notatek zrezygnowana: notatnik trzyma tylko bieżącą wersję.
--
-- Tabela była jedynym miejscem, w którym mieszkała przeszłość notatek. Nic jej już
-- nie zapisuje ani nie odczytuje, więc zostawianie jej oznaczałoby rozrastający się
-- katalog danych, których nikt nie pokazuje.
--
-- To migracja, która CASUJE historię — i świadomie jest ostatnia w tej sprawie:
-- przed wdrożeniem robimy kopię pliku bazy (/home/ubuntu/backups).

DROP TABLE IF EXISTS note_revisions;
