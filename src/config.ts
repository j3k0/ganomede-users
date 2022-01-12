'use strict';

import * as helpers from 'ganomede-helpers';
const pkg = require('../package.json');
const serviceConfig = helpers.links.ServiceEnv.config;

const parseApiSecret = () => {
  const valid = process.env.hasOwnProperty('API_SECRET')
    && (typeof process.env.API_SECRET === 'string')
    && (process.env.API_SECRET.length > 0);

  if (!valid)
    throw new Error('API_SECRET must be non-empty string');

  return process.env.API_SECRET;
};

const parseAppName = () => {
  var appName = process.env.APP_NAME;
  if (!appName)
    throw new Error('APP_NAME is missing');
  return appName;
}

export const name = pkg.name;
export const api = pkg.api;
export const secret = parseApiSecret();
export const appName = parseAppName();
export const events = serviceConfig('EVENTS', 8000);
export const reportedUsersApiConfig = {
  numEventsToProcess: +process.env.NUM_EVENTS_FOR_REPORTED_USERS_REPORT! || 10000,
  maxReturnedUsers: 50
};

export const blockedIndexerConfig = {
  blockedByUsernameId: 'blocks-by-username',
  blockedByUsernameField: 'data.username',
  blockedByTargetId: 'blocks-by-target',
  blockedByTargetField: 'data.target'
};

export const totpConfig = {
  digits: 6,
  secretKey: 'WY3DPEYR298XVHPK3P',
  period: 300 //in seconds.
};

export default {
  name, api, secret, appName, events, reportedUsersApiConfig, totpConfig
}

if (!module.parent)
  console.log('%s', require('util').inspect(module.exports, { depth: null })); // eslint-disable-line no-console
