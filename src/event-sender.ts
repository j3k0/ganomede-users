'use strict';

import * as GanomedeEvents from 'ganomede-events';
const {Client} = GanomedeEvents;
import logger from './log';
import config from './config';

const noop = (_err:any, _data?:any) => {};

// TODO
// probably worth adding retry logic
// (or maybe add it to Client)

export const createSender = ({
  // sender info
  clientId = config.api,
  channel = config.api,
  from = config.appName,
  // events backend
  secret = config.secret,
  protocol = config.events.protocol,
  hostname = config.events.host,
  port = config.events.port,
  pathname = undefined, // default is inside constructor
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

export const CREATE = 'CREATE';
export const CHANGE = 'CHANGE';
export const LOGIN = 'LOGIN';

export default {
  createSender,
  CREATE,
  CHANGE,
  LOGIN,
};
