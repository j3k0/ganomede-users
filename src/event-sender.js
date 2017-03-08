'use strict';

const {Client} = require('ganomede-events');
const logger = require('./log');
const config = require('../config');

const noop = () => {};

// TODO
// probably worth adding retry logic
// (or maybe add it to Client)

const createSender = ({
  // sender info
  clientId = config.api,
  channel = config.api,
  fromField = `https://prod.ggs.ovh/${config.api}`, // TODO fix this one
  // events backend
  secret = config.secret,
  protocol = config.events.protocol,
  hostname = config.events.host,
  port = config.events.port,
  pathname, // default is inside constructor
} = {}) => {
  const client = new Client(clientId, {
    secret,
    protocol,
    hostname,
    port,
    pathname
  });

  const sendEvent = (type, data, callback = noop) => {
    const event = {
      type,
      from: fromField,
      data
    };

    client.send(channel, event, (err, eventHeader) => {
      if (err) {
        logger.error('Failed to send event', err);
        return callback(err);
      }

      logger.debug('Event %s sent', type, eventHeader);
      callback(null, eventHeader);
    });
  };

  return sendEvent;
};

module.exports = {
  createSender,
  CREATE: 'CREATE',
  CHANGE: 'CHANGE',
  LOGIN: 'LOGIN'
};
