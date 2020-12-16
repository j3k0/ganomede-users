import { UsermetaClientOptions, UsermetaClientCallback, SimpleUsermetaClient } from "../src/usermeta";

const DEFAULT_MAX_LENGTH = 200;
class FakeUsermetaClient implements SimpleUsermetaClient {
  store: any;
  constructor() {
    this.store = {};
  }
  set(params:UsermetaClientOptions|string, key:string, value:string, cb:UsermetaClientCallback, maxLength?:number): void {
    if (maxLength == null) { maxLength = DEFAULT_MAX_LENGTH; }
    const username = typeof params === 'string' ? params : params.username; 
    const token = `${username}:${key}`;
    this.store[token] = value;
    cb(null);
  }
  get(params:UsermetaClientOptions|string, key:string, cb:UsermetaClientCallback): void {
    const username = typeof params === 'string' ? params : params.username; 
    const token = `${username}:${key}`;
    cb(null, this.store[token] ?? null);
  }
}

export function createClient(_redis?) {
  return new FakeUsermetaClient();
}

export default {createClient};

// vim: ts=2:sw=2:et: