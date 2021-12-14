import { Event } from "../event-sender";
import * as GanomedeEvents from 'ganomede-events';

export type UserBlock = { username: string, on: number };
export type GetUserBlocks = {
    blockedBy: UserBlock[];
    reportedBy: UserBlock[];
    reports: UserBlock[];
    blocks: UserBlock[];
}

export type CreateIndexerClientOptions = {
    secret?: string;
    protocol?: string;
    hostname?: string;
    port?: number;
    pathname?: string;
    client?: GanomedeEvents.IndexerClient;
};

export type CreateIndexRequest = (id: string, channel: string, field: string, callback: (error: Error | null, result: string) => void) => void;
export type GetIndexEventsRequest = (indexId: string, indexValue: string, callback: (err: Error | null, result: GanomedeEvents.GetIndexEventsResult) => void) => void;

export type EventWithTimeStamp = Event & {
    timestamp: number;
};
