// Node-only D1 adapter for local development and integration tests.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function localDatabase(filename=':memory:') {
 const sqlite=new DatabaseSync(filename);
 sqlite.exec(fs.readFileSync(new URL('./vocabulary-schema.sql',import.meta.url),'utf8'));
 return {
  sqlite,
  prepare(sql) {
   return {
    bind(...args) {
     return {
      async first() { return sqlite.prepare(sql).get(...args)||null; },
      async run() { const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}; }
     };
    }
   };
  }
 };
}
