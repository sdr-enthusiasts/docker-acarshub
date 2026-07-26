// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";

export interface MigrationStep {
  revision: string;
  name: string;
  upgrade: (db: Database.Database) => void;
}
