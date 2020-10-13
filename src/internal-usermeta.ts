/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//
// Store an internal information in usermeta
//
const createClient = function(options) {

  const KEY_NAME = options.key;
  if (!KEY_NAME) {
    throw new Error("key not defined");
  }

  const {
    usermetaClient
  } = options;
  if (!usermetaClient) {
    throw new Error("usermetaClient not defined");
  }

  if (usermetaClient.validKeys && !usermetaClient.isValid(KEY_NAME)) {
    usermetaClient.validKeys[KEY_NAME] = true;
  }

  return {
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

const clientFactory = key => ({ usermetaClient }) => createClient({ usermetaClient, key });

export default {
  createClient,
  clientFactory
};

// vim: ts=2:sw=2:et:
