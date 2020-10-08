// - read req.params.tag
// - load the user id from the ganomede-directory
// - store it into req.params.username
//
// in case of error, sets req.params.username = req.params.tag
import * as tagizer from 'ganomede-tagizer';
import { Request, Response, Next } from 'restify';
import Logger from 'bunyan';
import { DirectoryClient } from '../directory-client';

// Link tag -> user id
const idFromTag = {};

// Check for known user id from tag, store in
// req.params.user.username and req.params.username
const loadFromCache = function(req:Request, tag:string, usernameField:string, userField:string) {
  const id = idFromTag[tag];
  if (id) {
    req.params = req.params || {};
    req.params[usernameField] = id;
    req.params[userField] = req.params[userField] || {};
    req.params[userField].username = id;
    return true;
  }
};

// Cache link user tag -> id
const saveToCache = (tag, account) => idFromTag[tag] = account.id;

const saveAccount = function(req:Request, account, usernameField:string, userField:string) {
  req.log.debug({account}, "saveAccount");
  req.params = req.params || {};
  req.params[usernameField] = account.id;
  req.params[userField] = req.params[userField] || {};
  req.params[userField].username = account.id;
  if (account.aliases) {
    req.params[userField].tag = account.aliases.tag;
    req.params[userField].name = account.aliases.name;
    req.params[userField].email = account.aliases.email;
  }
};

export interface ParseTagOptions {

  /** Link to the directory client. */
  directoryClient: DirectoryClient;

  /** customer logger */
  log?: Logger;

  /** Key to read the tag from in req.params or req.body */
  tagField?: string;

  /** Key to write the username to in req.params */
  usernameField?: string;
  
  /** Key to writte the user data to in req.params */
  userField?: string;
}

const createBodyMiddleware = function(obj: ParseTagOptions) {
  const directoryClient = obj.directoryClient;
  // const log = obj.log;
  const tagField = obj.tagField ?? "tag";
  const usernameField = obj.usernameField ?? "username";
  const userField = obj.userField ?? "user";
  return function(req:Request, _res:Response, next:Next): void {

    req.log.info({tagField}, 'bodyTag middleware');
    const tag = req.body[tagField];
    if (!directoryClient || !tag) {
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
        req.body[tagField] = account.id;
        saveAccount(req, account, usernameField, userField);
        saveToCache(tagtag, account);
      }

      return next();
    });
  };
};

const createParamsMiddleware = function(obj: ParseTagOptions) {
  const directoryClient = obj.directoryClient;
  // const log = obj.log;
  const tagField = obj.tagField ?? "tag";
  const usernameField = obj.usernameField ?? "username";
  const userField = obj.userField ?? "user";
  return function(req:Request, _res:Response, next:Next): void {

    const tag = req.params[tagField];

    if (!directoryClient || !tag) {
      req.params[usernameField] = tag;
      return next();
    }

    const tagtag = tagizer.tag(tag);

    if (loadFromCache(req, tagtag, usernameField, userField)) {
      return next();
    }

    const req_id = req.id();
    return directoryClient.byAlias({
      type: "tag",
      value: tagtag,
      req_id
    }, function(err, account) {

      if (err) {
        req.log.warn({err, tag, req_id}, "directoryClient.byAlias failed");
        req.params[usernameField] = tag;
      } else if (!account) {
        req.log.warn({tag, value: tagtag, req_id},
          "directoryClient.byAlias returned no account");
        req.params[usernameField] = tag;
      } else {
        saveAccount(req, account, usernameField, userField);
        saveToCache(tagtag, account);
      }

      return next();
    });
  };
};

export default {createParamsMiddleware, createBodyMiddleware};
