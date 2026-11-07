import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {captureOperation} from './knowledge-inputs.ts';
export interface Connection {query(sql:string,params?:any[]):Promise<{rows:any[];rowCount?:number|null}>;release?():void;}
export interface Database extends Connection {connect?():Promise<Connection>;end?():Promise<void>;}
export class Store {
  constructor(public db:Database){}
  async initialize(){for(const sql of (await readFile(new URL('./schema.sql',import.meta.url),'utf8')).split(';'))if(sql.trim())await this.db.query(sql);}
  async tx<T>(fn:(db:Connection)=>Promise<T>):Promise<T>{const db=this.db.connect?await this.db.connect():this.db;await db.query('BEGIN');try{const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release?.();}}
  async lock(db:Connection){await db.query("INSERT INTO leases(name,owner,until_at) VALUES('business-lock','transaction',now()) ON CONFLICT DO NOTHING");await db.query("SELECT name FROM leases WHERE name='business-lock' FOR UPDATE");}
  async list(kind:string,db:Connection=this.db){return (await db.query('SELECT body FROM records WHERE kind=$1 ORDER BY updated_at DESC',[kind])).rows.map(r=>r.body);}
  async put(kind:string,body:any,db:Connection=this.db){await db.query('INSERT INTO records(kind,id,body) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET body=$3,updated_at=now()',[kind,body.id,JSON.stringify(body)]);return body;}
  async get(kind:string,id:string,db:Connection=this.db){return (await db.query('SELECT body FROM records WHERE kind=$1 AND id=$2',[kind,id])).rows[0]?.body;}
  async audit(actorId:string,action:string,entityId:string,detail:unknown,db:Connection=this.db){const id=randomUUID();await db.query('INSERT INTO audit(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[id,actorId,action,entityId,JSON.stringify(detail)]);await captureOperation(db,actorId,action,entityId,id);}
}
export function postgres(url:string){return new Store(new Pool({connectionString:url,max:12}));}
