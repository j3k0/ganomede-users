/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Generate a random token
const rand = () => Math.random().toString(36).substr(2);
const defaultGenToken = () => rand() + rand();
const defaultTimestamp = () => "" + (new Date().getTime());
import log from './log';

const createAuthenticator = function(...args) {

  const obj = args[0],
        {
          authdbClient,
          localUsermetaClient,
          centralUsermetaClient
        } = obj,
        val = obj.genToken,
        genToken = val != null ? val : defaultGenToken,
        val1 = obj.timestamp,
        timestamp = val1 != null ? val1 : defaultTimestamp,
        val2 = obj.apiSecret,
        apiSecret = val2 != null ? val2 : process.env.API_SECRET;
  return {
    updateAuthMetadata(account) {
      const t = timestamp();
      const params = {
        req_id:    account.req_id,
        username:  account.username,
        apiSecret
      };
      localUsermetaClient.set(params, "auth", t, function(err, reply) {});
      return centralUsermetaClient.set(params, "auth", t, function(err, reply) {});
    },

    getAuthMetadata(account, cb) {
      return centralUsermetaClient.get(account.username, "auth", cb);
    },

    // Add authentication token in authDB, save 'auth' metadata.
    add(account) {

      // Generate and save the token
      const token = account.token || genToken();
      authdbClient.addAccount(token, {
        username: account.username,
        email: account.email
      }
      , function(err) {
        if (err) {
          return log.warn({err}, "authdbClient.addAccount failed");
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
