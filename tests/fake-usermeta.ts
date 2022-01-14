import { UsermetaClientOptions, UsermetaClientCallback, SimpleUsermetaClient, UsermetaClientBulkOptions, UsermetaClientBulkCallback, KeyValue, BulkedUsermetaClient } from "../src/usermeta";
import async from 'async';

const DEFAULT_MAX_LENGTH = 200;
class FakeUsermetaClient extends BulkedUsermetaClient implements SimpleUsermetaClient {
  store: any;
  type: string;
  constructor() {
    super();
    this.store = {};
    this.type = "FakeUsermetaClient";
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