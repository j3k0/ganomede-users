// request to return a N number of most reported users.
// get latest events (M events)
// process them and return the top X number by total-reports desc.

import restify from 'restify';
import restifyErrors from "restify-errors";
import { LatestEvents } from '../latest-events';
import config from "../config";
import { ProcessReportedUsers, UserReports } from "./events-processor";

const reportedUsersApi = (latestEvent: LatestEvents | null, processReportedUsers: ProcessReportedUsers | null) =>
    (req: restify.Request, res: restify.Response, next: restify.Next) => {
        const secret = req.params.secret;
        if (secret === null || secret === undefined || secret === '') {
            return next(new restifyErrors.InternalServerError("Secret is not provided"));
        }

        latestEvent!(config.latestEventConfig.channel, config.latestEventConfig.limit, (err: Error | null, data: any) => {
            if (err) {
                return next(new restifyErrors.InternalServerError({
                    context: err,
                }, 'Request to latest event failed'));
            }

            processReportedUsers!(secret, data, (error: Error | null, results: UserReports[] | null) => {

                if (error) {
                    return next(new restifyErrors.InternalServerError({
                        context: err,
                    }, 'Request to process reported users failed'));
                }

                res.send(results);
                next();
            });
        });
    };

const addRoutes = (prefix: string, latestEvent: LatestEvents | null, processReportedUsers: ProcessReportedUsers | null, server: restify.Server) => {
    server.get(`/${prefix}/reported-users`, reportedUsersApi(latestEvent, processReportedUsers));
};

export default { addRoutes };