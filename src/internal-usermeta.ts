/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//
// Store an internal information in usermeta

import { UsermetaClient, UsermetaClientCallback } from "./usermeta";

export interface InternalUsermetaOptions {
  key: string;
  usermetaClient: UsermetaClient;
};

export interface InternalUsermetaClient {
  type: string;
  set: (username: string, value: string, callback: UsermetaClientCallback) => void;
  get: (username: string, callback: UsermetaClientCallback) => void;
}

export function createClient(options: InternalUsermetaOptions): InternalUsermetaClient {

  const KEY_NAME = options.key;
  if (!KEY_NAME) {
    throw new Error("key not defined");
  }

  const usermetaClient = options.usermetaClient;
  if (!usermetaClient) {
    throw new Error("usermetaClient not defined");
  }

  if ('validKeys' in usermetaClient && usermetaClient.validKeys && !usermetaClient.isValid(KEY_NAME)) {
    usermetaClient.validKeys[KEY_NAME] = true;
  }

  return {
    type: usermetaClient.type,
    // Retrieve account alias
    get(username, cb) {
      return usermetaClient.get(username, KEY_NAME, cb);
    },

    // Save the account alias
    set(username, value, cb) {
      return usermetaClient.set(username, KEY_NAME, value, cb);
    }
  };
};

export function clientFactory(key: string) {
  return function ({ usermetaClient }: { usermetaClient: UsermetaClient }) {
    return createClient({ usermetaClient, key });
  };
}

export default {
  createClient,
  clientFactory
};

// vim: ts=2:sw=2:et: