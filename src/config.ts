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
export const latestEventConfig = {
  limit: 10000,
  channel: 'users/v1/blocked-users',
  processTop: 50
};

export default {
  name, api, secret, appName, events, latestEventConfig
}

if (!module.parent)
  console.log('%s', require('util').inspect(module.exports, {depth: null})); // eslint-disable-line no-console
