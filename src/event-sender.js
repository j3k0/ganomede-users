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
  from = `https://prod.ggs.ovh/${config.api}`, // TODO fix this one
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

  const sender = (type, data, callback = noop) => {
    const event = {req_id: data.req_id, type, from, data};
    delete data.req_id;

    client.send(channel, event, (err, eventHeader) => {
      if (err) {
        logger.warn({err}, 'Failed to send event');
        return callback(err);
      }

      logger.debug({type, eventHeader}, 'Event sent');
      callback(null, eventHeader);
    });
  };

  return sender;
};

module.exports = {
  createSender,
  CREATE: 'CREATE',
  CHANGE: 'CHANGE',
  LOGIN: 'LOGIN'
};
