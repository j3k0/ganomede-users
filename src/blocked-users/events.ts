import config from '../config';

export const CHANNEL = config.api + '/blocked-users';

export const BLOCKED = 'BLOCKED';
export const UNBLOCKED = 'UNBLOCKED';
export const REPORTED = 'REPORTED';

export type BlockedUserEventType = 'BLOCKED' | 'UNBLOCKED' | 'REPORTED';

export interface BlockedUserEvent {
    req_id: string;
    // type: BlockedUserEventType; (already part of base event data)
    username: string;
    target: string;
    // blocked: string[]; (removed to make the event list lighter)
}

export function eventData(req_id: string, originatorUsername: string, targetUsername: string): BlockedUserEvent {
    return {
        req_id,
        username: originatorUsername,
        target: targetUsername
    }
}

export function blockEvent(req_id: string, originatorUsername: string, targetUsername: string): BlockedUserEvent {
    return eventData(req_id, originatorUsername, targetUsername);
}

export function unblockEvent(req_id: string, originatorUsername: string, targetUsername: string): BlockedUserEvent {
    return eventData(req_id, originatorUsername, targetUsername);
}

export function reportEvent(req_id: string, originatorUsername: string, targetUsername: string): BlockedUserEvent {
    return eventData(req_id, originatorUsername, targetUsername);
}