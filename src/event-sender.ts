'use strict';

import * as GanomedeEvents from 'ganomede-events';
const { Client } = GanomedeEvents;
import logger from './log';
import config from './config';
import { BlockedUserEvent } from './blocked-users/events';
import { stringify } from 'querystring';

// directory-client
export const USERS_EVENTS_CHANNEL: string = config.api;

export const CREATE = 'CREATE';
export const CHANGE = 'CHANGE';
export const LOGIN = 'LOGIN';

export interface DirectoryEventData {
  req_id?: string;
  userId?: string;
  aliases?: AliasesDictionary;
}

export interface AliasesDictionary {
  email?: string;
  tag?: string;
  name?: string;
}

export type EventSenderCallback = (err: any, data?: any) => void;

const noop: EventSenderCallback = (_err: any, _data?: any) => { };

export type EventData = DirectoryEventData | BlockedUserEvent;

export interface Event {
  req_id?: string;
  type: string;
  from: string;
  data: EventData
};

export interface EventHeader {
};

// TODO
// probably worth adding retry logic
// (or maybe add it to Client)
export type EventSender = (
  channel: string,
  type: string,
  data: EventData,
  callback?: (err: Error | null, data: any) => void
) => void;

export interface EventSenderOptions {
  clientId?: string;
  from?: string;
  secret?: string;
  protocol?: string;
  hostname?: string;
  port?: number;
  pathname?: string;
};

export const createSender = ({
  // sender info
  clientId = config.api,
  from = config.appName,
  // events backend
  secret = config.secret,
  protocol = config.events.protocol,
  hostname = config.events.host,
  port = config.events.port,
  pathname = undefined, // default is inside constructor
}: EventSenderOptions = {}) => {
  const client = new Client(clientId, {
    secret,
    protocol,
    hostname,
    port,
    pathname
  });

  const sender = (channel: string, type: string, data: EventData, callback: EventSenderCallback = noop) => {
    const event: Event = { req_id: data.req_id, type, from, data };
    delete data.req_id;

    client.send(channel, event, (err, eventHeader: EventHeader) => {
      if (err) {
        logger.warn({ err }, 'Failed to send event');
        return callback(err);
      }

      logger.debug({ type, eventHeader }, 'Event sent');
      callback(null, eventHeader);
    });
  };

  return sender;
};

export default {
  createSender,
  CREATE,
  CHANGE,
  LOGIN,
};
