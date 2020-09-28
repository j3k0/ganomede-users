/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// - read req.params.tag
// - load the user id from the ganomede-directory
// - store it into req.params.username
//
// in case of error, sets req.params.username = req.params.tag
import tagizer from 'ganomede-tagizer';

// Link tag -> user id
const idFromTag = {};

// Check for known user id from tag, store in
// req.params.user.username and req.params.username
const loadFromCache = function(req, tag) {
  const id = idFromTag[tag];
  if (id) {
    req.params = req.params || {};
    req.params.username = id;
    req.params.user = req.params.user || {};
    req.params.user.username = id;
    return true;
  }
};

// Cache link user tag -> id
const saveToCache = (tag, account) => idFromTag[tag] = account.id;

const saveAccount = function(req, account) {
  req.log.debug({account}, "saveAccount");
  req.params = req.params || {};
  req.params.username = account.id;
  req.params.user = req.params.user || {};
  req.params.user.username = account.id;
  if (account.aliases) {
    req.params.user.tag = account.aliases.tag;
    req.params.user.name = account.aliases.name;
    return req.params.user.email = account.aliases.email;
  }
};

const createBodyMiddleware = function(...args) { const obj = args[0],
      {
        directoryClient,
        log
      } = obj,
      val = obj.field,
      field = val != null ? val : "tag"; return function(req, res, next) {

  req.log.info({field}, 'bodyTag middleware');
  const tag = req.body[field];
  if (!directoryClient) {
    return next();
  }

  const tagtag = tagizer.tag(tag);

  const req_id = req.id();
  return directoryClient.byAlias({
    type: "tag",
    value: tagtag,
    req_id
  }, function(err, account) {

    if (err && (err.statusCode !== 404)) {
      req.log.warn({err, tag}, "directoryClient.byAlias failed");
    } else if (!account) {
      req.log.info({tag},
        "directoryClient.byAlias returned no account");
    } else {
      req.log.debug({account}, "directoryClient.byAlias succeeded");
      req.body[field] = account.id;
      saveAccount(req, account);
      saveToCache(tagtag, account);
    }

    return next();
  });
}; };

const createParamsMiddleware = function(...args) { const obj = args[0],
      {
        directoryClient,
        log
      } = obj,
      val = obj.field,
      field = val != null ? val : "tag"; return function(req, res, next) {

  const tag = req.params[field];

  if (!directoryClient) {
    req.params.username = tag;
    return next();
  }

  const tagtag = tagizer.tag(tag);

  if (loadFromCache(req, tagtag)) {
    return next();
  }

  const req_id = req.id();
  return directoryClient.byAlias({
    type: "tag",
    value: tagtag,
    req_id
  }, function(err, account) {

    if (err) {
      log.warn({err, tag, req_id}, "directoryClient.byAlias failed");
      req.params.username = tag;
    } else if (!account) {
      log.warn({tag, value, req_id},
        "directoryClient.byAlias returned no account");
      req.params.username = tag;
    } else {
      saveAccount(req, account);
      saveToCache(tagtag, account);
    }

    return next();
  });
}; };

export default {createParamsMiddleware, createBodyMiddleware};
