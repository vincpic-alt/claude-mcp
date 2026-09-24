import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
export const random = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('base64url');
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, value TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(kind,id));`);
  }
  put(kind,id,value,ttl) { this.db.prepare('INSERT OR REPLACE INTO records VALUES (?,?,?,?)').run(kind,id,JSON.stringify(value),Date.now()+ttl*1000); }
  get(kind,id) { const row=this.db.prepare('SELECT value FROM records WHERE kind=? AND id=? AND expires>?').get(kind,id,Date.now()); return row ? JSON.parse(row.value) : null; }
  del(kind,id) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result=fn(); this.db.exec('COMMIT'); return result; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  cleanup() { this.db.prepare('DELETE FROM records WHERE expires<=?').run(Date.now()); }
  close() { this.db.close(); }
}
