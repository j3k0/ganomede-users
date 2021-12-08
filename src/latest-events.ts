'use strict';

import * as GanomedeEvents from 'ganomede-events';
const { Client } = GanomedeEvents;
import logger from './log';
import config from './config';
import { EventHeader, EventSenderCallback, EventSenderOptions } from './event-sender';
import restifyErrors from "restify-errors";

const noop: EventSenderCallback = (_err: any, _data?: any) => { };

export type LatestEventsOptions = EventSenderOptions & {
  client?: GanomedeEvents.Client;
};

export type LatestEvents = (
  channel: string,
  limit: number,
  callback?: (err: Error | null, data: any) => void
) => void;


export const createLatestEventsClient = ({
  // sender info
  clientId = config.api,
  // events backend
  secret = config.secret,
  protocol = config.events.protocol,
  hostname = config.events.host,
  port = config.events.port,
  pathname = undefined, // default is inside constructor
  client = undefined
}: LatestEventsOptions = {}) => {
  if (client === undefined)
    client = new Client(clientId, {
      secret,
      protocol,
      hostname,
      port,
      pathname
    });


  const latest: LatestEvents = (channel: string, limit: number, callback: EventSenderCallback = noop) => {

    if (channel === '' || channel === null || channel === undefined)
      return callback(new restifyErrors.InternalServerError("Channel is not provided"));

    client?.getLatestEvents(channel, limit, (err, eventHeader: EventHeader) => {
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
  createLatestEventsClient
};
