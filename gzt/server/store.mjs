import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSeed} from './seed.mjs';

export class JsonStore {
  #file; #data; #saving = false; #dirty = false;
  constructor(file) {
    this.#file = file;
  }
  async init() {
    await mkdir(dirname(this.#file), {recursive:true});
    try {
      const raw = await readFile(this.#file, 'utf8');
      this.#data = JSON.parse(raw);
    } catch {
      this.#data = createSeed();
      await this.#persist();
    }
  }
  get data() { return this.#data; }
  list(kind) { return this.#data[kind] || []; }
  find(kind, id) { return this.list(kind).find(x => x.id === id); }
  put(kind, item) {
    if (!this.#data[kind]) this.#data[kind] = [];
    const i = this.#data[kind].findIndex(x => x.id === item.id);
    if (i >= 0) this.#data[kind][i] = item;
    else this.#data[kind].unshift(item);
    this.#persist();
    return item;
  }
  append(kind, item) {
    if (!item.id) item.id = randomUUID();
    return this.put(kind, item);
  }
  audit(actorId, action, entityId, detail) {
    if (!this.#data.audit) this.#data.audit = [];
    this.#data.audit.unshift({id:randomUUID(),actorId,action,entityId,at:new Date().toISOString(),detail});
    this.#persist();
  }
  async #persist() {
    this.#dirty = true;
    if (this.#saving) return;
    this.#saving = true;
    try {
      while (this.#dirty) {
        this.#dirty = false;
        await writeFile(this.#file, JSON.stringify(this.#data, null, 2), 'utf8');
      }
    } finally { this.#saving = false; }
  }
}

export function timestamp() { return new Date().toISOString(); }
