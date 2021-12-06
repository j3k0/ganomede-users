'use strict';

import * as GanomedeEvents from 'ganomede-events';
const { Client } = GanomedeEvents;
import logger from './log';
import config from './config';
import { EventHeader, EventSenderCallback, EventSenderOptions } from './event-sender';
import { Bans } from './bans';

const noop: EventSenderCallback = (_err: any, _data?: any) => { };


export type EventLatest = (
  channel: string,
  limit: number,
  callback?: (err: Error | null, data: any) => void
) => void;


export const createLatest = ({
  // sender info
  clientId = config.api,
  // events backend
  secret = config.secret,
  protocol = config.events.protocol,
  hostname = config.events.host,
  port = config.events.port,
  pathname = undefined // default is inside constructor
}: EventSenderOptions = {}) => {
  const client = new Client(clientId, {
    secret,
    protocol,
    hostname,
    port,
    pathname
  });


  const latest = (channel: string, limit: number, callback: EventSenderCallback = noop) => {

    client.getLatestEvents(channel, limit, (err, eventHeader: EventHeader) => {
      if (err) {
        logger.warn({ err }, 'Failed to get latest events');
        return callback(err);
      }

      callback(null, eventHeader);
    });
  };

  return latest;
};

export default {
  createLatest
};
