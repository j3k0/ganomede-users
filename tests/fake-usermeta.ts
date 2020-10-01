/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const DEFAULT_MAX_LENGTH = 200;
class UsermetaClient {
  store: any;
  constructor() {
    this.store = {};
  }
  set(username, key, value, cb, maxLength) {
    if (maxLength == null) { maxLength = DEFAULT_MAX_LENGTH; }
    const token = `${username}:${key}`;
    this.store[token] = value;
    return cb(null);
  }
  get(username, key, cb) {
    const token = `${username}:${key}`;
    if (!this.store[token]) {
      return cb(null, null);
    }
    return cb(null, this.store[token]);
  }
}

export function createClient(_redis?) {
  return new UsermetaClient();
}

export default {createClient};

// vim: ts=2:sw=2:et: