import config from '../config';

export const CHANNEL = config.api + '/blocked-users';

export const BLOCKED = 'BLOCKED';
export const UNBLOCKED = 'UNBLOCKED';

export type BlockedUserEventType = 'BLOCKED' | 'UNBLOCKED';

export interface BlockedUserEvent {
    req_id: string;
    type: BlockedUserEventType;
    username: string;
    target: string;
    blocked: string[];
}

export function eventData(req_id: string, type: BlockedUserEventType, originatorUsername: string, targetUsername: string, newList: string[]): BlockedUserEvent {
    return {
        type,
        req_id,
        username: originatorUsername,
        target: targetUsername,
        blocked: newList,
    }
}

export function blockEvent(req_id: string, originatorUsername: string, targetUsername: string, newList: string[]): BlockedUserEvent {
    return eventData(req_id, BLOCKED, originatorUsername, targetUsername, newList);
}

export function unblockEvent(req_id: string, originatorUsername: string, targetUsername: string, newList: string[]) {
    return eventData(req_id, UNBLOCKED, originatorUsername, targetUsername, newList);
}