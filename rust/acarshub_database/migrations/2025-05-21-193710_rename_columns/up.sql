ALTER TABLE level RENAME TO _level_old;

CREATE TABLE level (id INTEGER NOT NULL, level_data INTEGER, count INTEGER, PRIMARY KEY(id));

INSERT INTO level (id, level_data, count)
  SELECT id, level, count
  FROM _level_old;

DROP TABLE _level_old;
