import { UsermetaClientSingleOptions, UsermetaClientCallback, SimpleUsermetaClient, UsermetaClientBulkOptions, BulkedUsermetaClient, UsermetaClientGetBulkCallback, KeyValue } from "../src/usermeta";

const DEFAULT_MAX_LENGTH = 200;
export class FakeUsermetaClient extends BulkedUsermetaClient implements SimpleUsermetaClient {
  store: any;
  type: string;
  callCounts: { [method: string]: number };

  constructor() {
    super();
    this.store = {};
    this.type = "FakeUsermetaClient";
    this.callCounts = { get: 0, set: 0, getBulk: 0, setBulk: 0 };
  }

  set(params:UsermetaClientSingleOptions|string, key:string, value:string, cb:UsermetaClientCallback, maxLength?:number): void {
    if (maxLength == null) { maxLength = DEFAULT_MAX_LENGTH; }
    const username = typeof params === 'string' ? params : params.username; 
    const token = `${username}:${key}`;
    this.store[token] = value;
    this.callCounts['set'] = (this.callCounts['set'] || 0) + 1;
    cb(null);
  }

  get(params:UsermetaClientSingleOptions|string, key:string, cb:UsermetaClientCallback): void {
    const username = typeof params === 'string' ? params : params.username; 
    const token = `${username}:${key}`;
    this.callCounts['get'] = (this.callCounts['get'] || 0) + 1;
    cb(null, this.store[token] ?? null);
  }

  getBulk(pparams: string | UsermetaClientBulkOptions, keys: string[], cb: UsermetaClientGetBulkCallback): void {
    this.callCounts['getBulk'] = (this.callCounts['getBulk'] || 0) + 1;
    let usernames:string[] = [];
    if (typeof pparams === 'string') {
      usernames.push(pparams);
    }
    else {
      usernames = pparams.usernames;
    }
    type T1 = { username: string, key: string, token: string };
    const tokens = usernames.reduce((tokens: T1[], username) => {
      const newTokens = keys.map(key => ({ username, key, token: `${username}:${key}` }));
      return tokens.concat(newTokens);
    }, []);
    cb(null, tokens.map(t => ({ username: t.username, key: t.key, value: this.store[t.token] })));
  }
}

export function createClient(_redis?): FakeUsermetaClient {
  return new FakeUsermetaClient();
}

export default {createClient};

// vim: ts=2:sw=2:et: