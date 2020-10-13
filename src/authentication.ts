import log from './log';
import { HttpError } from 'restify-errors';
import { UsermetaClient, UsermetaClientCallback } from './usermeta';

// Generate a random token
const rand = () => Math.random().toString(36).substr(2);
const defaultGenToken = () => rand() + rand();
const defaultTimestamp = () => "" + (new Date().getTime());

export interface AuthdbUser {
  username: string;
  email?: string;
}

export interface AuthdbClient {
  addAccount: (token: string, user: AuthdbUser, callback?: (err?: HttpError | null) => void) => void;
  getAccount: (token: string, callback: (err: HttpError | null, user?: AuthdbUser) => void) => void;
}

export interface AuthenticatorAccount {
  req_id?: string;
  username: string;
  email: string;
  token?: string;
}

export interface AuthenticatorOptions {
  authdbClient: AuthdbClient;
  localUsermetaClient?: UsermetaClient;
  centralUsermetaClient?: UsermetaClient;
  genToken?: () => string;
  timestamp?: () => string;
  apiSecret?: string;
}

const createAuthenticator = function(options: AuthenticatorOptions) {

  const authdbClient: AuthdbClient = options.authdbClient;
  const localUsermetaClient: UsermetaClient|undefined = options.localUsermetaClient;
  const centralUsermetaClient: UsermetaClient|undefined = options.centralUsermetaClient;
  const genToken = options.genToken ?? defaultGenToken;
  const timestamp = options.timestamp ?? defaultTimestamp;
  const apiSecret = options.apiSecret ?? process.env.API_SECRET;

  return {
    updateAuthMetadata(account: AuthenticatorAccount) {
      const t = timestamp();
      const params = {
        req_id:    account.req_id,
        username:  account.username,
        apiSecret
      };
      localUsermetaClient?.set(params, "auth", t, function(err, reply) {});
      centralUsermetaClient?.set(params, "auth", t, function(err, reply) {});
    },

    getAuthMetadata(account: AuthenticatorAccount, callback: UsermetaClientCallback) {
      if (centralUsermetaClient)
        centralUsermetaClient.get(account.username, "auth", callback);
      else
        callback(null, null);
    },

    // Add authentication token in authDB, save 'auth' metadata.
    add(account: AuthenticatorAccount) {

      // Generate and save the token
      const token = account.token || genToken();
      authdbClient.addAccount(token, {
        username: account.username,
        email: account.email
      }, function(err?: HttpError | null) {
        if (err) {
          log.warn({err}, "authdbClient.addAccount failed");
        }
      });

      // Store the auth date (in parallel, ignoring the outcome)
      this.updateAuthMetadata(account);

      // Return REST-ready authentication data
      return {
        username: account.username,
        email: account.email,
        token
      };
    }
  };
};

export default {
  createAuthenticator
};

// vim: ts=2:sw=2:et:
