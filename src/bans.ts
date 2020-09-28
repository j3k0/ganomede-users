/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const parseTimestampString = function(value) {
  const str = String(value);
  const int = parseInt(str, 10);
  const okay = isFinite(int) && /\d{13}/.test(str); // 13 digits should cover it :)
  return {okay, value: okay ? int : 0};
};

class BanInfo {
  constructor(username, creationTimestamp) {
    const {okay: exists, value: createdAt} = parseTimestampString(creationTimestamp);
    this.username = username;
    this.exists = exists;
    this.createdAt = createdAt;
  }
}

// callback(err, stuff...) => callback(err)
const wrapCallback = cb => err => cb(err);

class Bans {
  constructor({usermetaClient, prefix}) {
    this.usermetaClient = usermetaClient;
    this.prefix = prefix;
    this.prefix = this.prefix || '$banned';
  }

  // key: (parts...) ->
  //   return [@prefix, parts...].join(':')

  // callback(err, BanInfo instance)
  get(params, cb) {
    const {username} = params;
    return this.usermetaClient.get(params, this.prefix, function(err, reply) {
      if (err) {
        return cb(err);
      }
      const info = new BanInfo(username, reply);
      return cb(null, info);
    });
  }

  // callback(err)
  ban(params, cb) {
    return this.usermetaClient.set(params, this.prefix,
      String(Date.now()), wrapCallback(cb));
  }

  // callback(err)
  unban(params, cb) {
    return this.usermetaClient.set(params, this.prefix, '<no>', wrapCallback(cb));
  }
}

export default {Bans, BanInfo};
