/*
* method responsible for processing the latest events 
* 1- group all events by users and do calculate the total of reports per user.
* 2- Sort the groups by the total desc.
* 3- Execute async parallel over all the users, check if each user is banned.
* 4- the end results will be an array (configured length) of users not banned in a desc order of their total
*/
import { Event } from "../event-sender";
import { BlockedUserEvent, REPORTED, USER_REVIEW } from "../blocked-users/events";
import config from '../config';
import Logger from "bunyan";

export type UserReports = { target: string, total: number };

export type ProcessReportedUsers = (secret: string, events: Event[], cb: (error: Error | null, results: UserReports[] | null) => void) => void;

export const createReportedUsersProcessor = (log: Logger) => (secret: string, events: Event[], cb: (error: Error | null, results: UserReports[] | null) => void) => {

    // Figure out who reported each users.
    // Remove all reports earlier than a USER_REVIEW by the admin.
    const groupedUserReported: { [target: string]: {[username: string]: boolean} } = {};
    for (const event of events) {
        if (!event.data) continue;
        const eventData: BlockedUserEvent = event.data as BlockedUserEvent;
        switch (event.type) {
            case REPORTED:
                if (groupedUserReported[eventData.target])
                    groupedUserReported[eventData.target][eventData.username] = true;
                else
                    groupedUserReported[eventData.target] = {[eventData.username]: true};
                break;
            case USER_REVIEW:
                delete groupedUserReported[eventData.target];
                break;
        }
    }

    // Calculate the number of "post-review" reports for each user.
    var userReports: UserReports[] = Object.keys(groupedUserReported).map(target => ({
        target,
        total: Object.keys(groupedUserReported[target]).length
    }));
    
    // Sorting the array descending by the total reports,
    // we have now a sorted array [{username, totalReports}]
    // Return only a number of reported users as per the config.
    cb(null, userReports
        .sort((a, b) => b.total - a.total)
        .slice(0, config.reportedUsersApiConfig.maxReturnedUsers));
};
