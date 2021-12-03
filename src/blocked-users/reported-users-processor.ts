import { Next, Request, Response } from "restify";
import { Event } from "../event-sender";
import { BlockedUserEvent, REPORTED } from "./events";
import config from '../config';
import { BanInfo, Bans } from "../bans";
import Logger from "bunyan";
import async from 'async';

export type UserReports = { target: string, total: number };

export const processReportedUsers = (log: Logger, secret: string, bans: Bans, events: Event[], cb: (error: Error | null, results: UserReports[] | null) => void) => {

    //build a key-value pair of user, total.
    //filter only reported events.
    //sum for each user the number of reports.
    let groupedUserReported: { [key: string]: number } = {};
    for (let i = 0, len = events.length; i < len; i++) {
        let event = events[i];
        if (event.type === REPORTED && event.data !== null) {
            let eventData: BlockedUserEvent = event.data as BlockedUserEvent;
            groupedUserReported[eventData.target] = (groupedUserReported[eventData.target] || 0) + 1;
        }
    }
    // or we do this
    // groupedUserReported = events.filter((event) => event.type === REPORTED)
    //     .map((event) => event.data as BlockedUserEvent)
    //     .reduce((result, currentValue: BlockedUserEvent) => {
    //         result[currentValue.target] = (result[currentValue.target] || 0) + 1;
    //         return result;
    //     }, {});

    //mapping the object to array of { target: string, total: number } for easy sorting.
    var reportedUsersArray: UserReports[] = Object.keys(groupedUserReported).map((key) => { return { target: key, total: groupedUserReported[key] }; });

    //sorting the array descending by the total reports.
    //we have now a sorted array [{username, totalReports}]
    reportedUsersArray = reportedUsersArray.sort((a, b) => b.total - a.total);

    //return only a number of reported users as per the config.
    let totalItemsTobeReturned = config.latestEventConfig.processTop;

    //check ban for a user, and callback the user in case only its not banned, else callback null.
    const checkBanAndCallbackUser = (user: UserReports, callback: (e: Error | null, notBannedUser: UserReports | null) => void) => {
        //calling bans api to get status of a user.
        bans.get({ username: user.target, apiSecret: secret }, (err: Error | null, ban?: BanInfo) => {
            if (err) {
                log.error('checkBan() failed', { err, username: user.target });
                return callback(err, null);
            }
            //if not banned, then callback the user object
            if (!ban?.exists)
                return callback(null, user);

            // user is banned, callback null.
            return callback(null, null);
        });
    };

    //prepare tasks to  be runned in parallel
    //each task will execute the ban check method, and callback the user.
    let tasks: any[] = [];
    reportedUsersArray.forEach((user) => {
        tasks.push(cb1 => checkBanAndCallbackUser(user, cb1));
    });

    //doing parallel tasks
    async.parallel(tasks, (err, data) => {
        if (err) {
            cb(err, null);
        }
        else {
            //filter data items that are not null
            let results = (data?.filter((u) => u !== null)) as UserReports[];
            //re-sort data items as per their total desc
            results = results.sort((a, b) => b.total - a.total);
            //get the first N elements from the array.
            results = results.slice(0, Math.min(totalItemsTobeReturned, results.length));
            cb(null, results);
        }
    });
};


