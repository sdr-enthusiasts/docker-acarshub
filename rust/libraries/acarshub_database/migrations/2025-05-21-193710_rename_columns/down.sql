ALTER TABLE level RENAME TO _level_old;

CREATE TABLE level (id INTEGER NOT NULL, level INTEGER, count INTEGER, PRIMARY KEY(id));

INSERT INTO level (id, level, count)
  SELECT id, level_data, count
  FROM _level_old;

DROP TABLE _level_old;
