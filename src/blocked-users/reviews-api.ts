
import { Next, Request, Response, Server } from "restify";
import restifyErrors from "restify-errors";
import { EventSender } from "../event-sender";
import { CHANNEL, USER_REVIEW, eventData } from "./events";

const addUserReview = (sendEvent: EventSender) => (req: Request, res: Response, next: Next) => {

    //checking secret, cause its mandatory
    const { secret } = req.query;
    if (secret === null || secret === undefined || secret === '' || secret !== process.env.API_SECRET) {
        return next(new restifyErrors.ForbiddenError("Secret is not provided"));
    }

    //checking username, cause its mandatory
    const { username } = req.body;
    if (username === null || username === undefined || username === '') {
        return next(new restifyErrors.InvalidContentError("Username is not provided"));
    }

    let data = eventData(req.id(), '$$', username);
    data.action = "CLEAN";

    sendEvent(CHANNEL, USER_REVIEW, data);

    res.send("OK");
    next();
};

export function addRoutes(prefix: string, server: Server, sendEvent: EventSender): void {

    server.post(`/${prefix}/admin/user-reviews`, addUserReview(sendEvent));
}

export default { addRoutes };
