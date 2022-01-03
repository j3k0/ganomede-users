/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
export interface Timestamp {
  okay: boolean;
  value: number;
}

export type GetBulkparams = {
  usernames: string[];
  apiSecret: string;
}

export type MultiBanInfo= { [key: string]: BanInfo; };

const parseTimestampString = function(value:string|number|null|undefined): Timestamp {
  const str = String(value);
  const i = parseInt(str, 10);
  const okay = isFinite(i) && /\d{13}/.test(str); // 13 digits should cover it :)
  return {okay, value: okay ? i : 0};
};

export class BanInfo {
  username: string;
  exists: boolean;
  createdAt: number;

  constructor(username, creationTimestamp) {
    const {okay: exists, value: createdAt} = parseTimestampString(creationTimestamp);
    this.username = username;
    this.exists = exists;
    this.createdAt = createdAt;
  }
}

// callback(err, stuff...) => callback(err)
const wrapCallback = cb => err => cb(err);

export interface BansOptions {
  usermetaClient: any;
  prefix?: string;
}

export class Bans {

  usermetaClient: any;
  prefix: string;

  constructor(options: BansOptions) {
    this.usermetaClient = options.usermetaClient;
    this.prefix = options.prefix || '$banned';
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

  getBulk(params: GetBulkparams, cb: (e: Error | null, res?: MultiBanInfo) => void) {
    const { apiSecret, usernames } = params;
    const pparams = { usernames, apiSecret };
    return this.usermetaClient.getBulk(pparams, [this.prefix], function (err, reply) {
      if (err) {
        return cb(err);
      }
      let banInfos: { [key: string]: BanInfo } = {};
      let tempObj = {};
      //format reply object from [{username, key, value}] to {username, key:value}
      reply.forEach(elem => {
        if (!tempObj[elem.username]) {
          tempObj[elem.username] = {};
          tempObj[elem.username]['username'] = elem.username;
        }
        tempObj[elem.username][elem.key] = elem.value;
      });
      reply = Object.keys(tempObj).map((k) => { return tempObj[k] });
      reply?.forEach((obj) => {
        if (obj !== null) {
          const info = new BanInfo(obj['username'], obj);
          banInfos[obj['username']] = info;
        }
      });
      
      return cb(null, banInfos);
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
