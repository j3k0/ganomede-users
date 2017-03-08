'use strict';

const helpers = require('ganomede-helpers');
const pkg = require('./package.json');
const serviceConfig = helpers.links.ServiceEnv.config;

const parseApiSecret = () => {
  const valid = process.env.hasOwnProperty('API_SECRET')
    && (typeof process.env.API_SECRET === 'string')
    && (process.env.API_SECRET.length > 0);

  if (!valid)
    throw new Error('API_SECRET must be non-empty string');

  return process.env.API_SECRET;
};

module.exports = {
  name: pkg.name,
  api: pkg.api,
  secret: parseApiSecret(),
  events: serviceConfig('EVENTS', 8080)
};

if (!module.parent)
  console.log('%s', require('util').inspect(module.exports, {depth: null})); // eslint-disable-line no-console
