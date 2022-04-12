/**
 * Email confirmation class
 * used on register a new account or when user change his/her email address.
 * thus, we will send an email with a token valid for few minutes to the email registered
 * and this class contains a Request handler to validate the token entered by the user.
 * if the token was validated, we will set a usermeta key that the user was confirmed on this time.
 * before sending an email, we will check if we already confirmed before using the usermeta key.
 */
import { Next, Request, Response } from "restify";
import { UsermetaClient, UsermetaClientSingleOptions } from "../usermeta";
import { sendError } from "../utils/send-error";
import restifyErrors, { HttpError, InternalServerError } from "restify-errors";
import totp from './totp';
import { CreatedMailerTransportResult, MailerSendOptions } from "../mailer";
import { RenderTemplate } from "../mail-template";
import logMod from "../log";
import { Translate } from "../translation";
import { DataKeys, DocumentContent } from "../data-client";
import mailTemplate from '../mail-template';
const log = logMod.child({ module: "api-confirm" });

export const CONFIRMED_META_KEY = '$confirmedemails';

export type SendMailInfo = {
    sent: boolean;
    alreadyConfirmed?: true;
}
export class EmailConfirmation {

    usermetaClient: UsermetaClient;
    mailerTransport?: CreatedMailerTransportResult;
    confirmEmailTemplate?: RenderTemplate<MailerSendOptions>;

    constructor(usermetaClient: UsermetaClient, mailerTransport: CreatedMailerTransportResult, confirmEmailTemplate: RenderTemplate<MailerSendOptions>) {
        this.usermetaClient = usermetaClient;
        this.mailerTransport = mailerTransport;
        this.confirmEmailTemplate = confirmEmailTemplate;

        this.confirmEmailCode = this.confirmEmailCode.bind(this);
        this.sendEmailConfirmation = this.sendEmailConfirmation.bind(this);
    }

    sendEmailConfirmation(params: UsermetaClientSingleOptions, username: string, email: string,
        checkIfConfirmed: boolean, translate: Translate, callback: (err: HttpError | undefined, info: SendMailInfo) => void) {
        //send email functionality
        const sendMail = () => {
            //generate token from the user email address.
            const token = totp.generate(email);
            const templateValues = { username, email, token };
            translate(DataKeys.emailConfirmation, params, this.confirmEmailTemplate?.template as DocumentContent,
                (localizedContent: DocumentContent) => {
                    const _confirmEmailTemplate = mailTemplate.createTemplate(localizedContent);
                    const content = _confirmEmailTemplate.render(templateValues) as Record<string, any>;
                    content.to = email;
                    content.req_id = params.req_id;
                    this.mailerTransport?.sendMail(content, () => {
                        callback(undefined, { sent: true });
                    });
                });
        };

        //if without confirmation, means its a new account registration
        //we send email directly.
        if (!checkIfConfirmed) {
            return sendMail();
        }

        //we get the usermeta to check if it was confirmed or no before.
        this.usermetaClient.get(params, CONFIRMED_META_KEY, (err, reply) => {
            if (reply !== null && reply !== undefined && reply !== '') {
                try {
                    const confirmations = JSON.parse(reply);
                    const thisEmailConfirmation = confirmations[email];
                    if (!thisEmailConfirmation) {
                        return sendMail();
                    }
                    else {
                        return callback(undefined, { sent:false, alreadyConfirmed: true });
                    }
                } catch (ex) {
                    log.warn({ req_id: params.req_id, ex }, "error when processing send email confirmation");
                    callback(new InternalServerError((ex as Error)?.message), { sent: false });
                }
            }//no value found, so send email confirmation with a token.
            else {
                return sendMail();
            }
        });
    }

    confirmEmailCode(req: Request, res: Response, next: Next): void {

        //checking for user object, and user email
        //if not defined, send error.
        if (!req.params.user || !req.params.user.email) {
            return sendError(req, new restifyErrors.NotAuthorizedError({
                code: 'NotAuthorizedError',
                message: "Forbidden"
            }), next);
        }
        const email = req.params.user.email;
        const { accessCode } = req.body;

        //token is mandatory, if not found send an error.
        if (!accessCode) {
            return sendError(req, new restifyErrors.InvalidContentError({
                code: 'MissingAccessCode',
                message: "token is not provided"
            }), next);
        }

        //prepare usermeta params for the set method.
        const params: UsermetaClientSingleOptions = {
            username: req.params.user.username,
            //authToken: req.params.authToken || (req as any).context.authToken,
            apiSecret: req.params.apiSecret,
            req_id: req.id()
        };

        //verify token corresponding to the user email address.
        const isValid = totp.verify(email, accessCode);
        if (isValid) {
            //if is valid, then the set confirmation usermeta with current time.
            //we need to check first if exists confirmed key object.
            this.usermetaClient.get(params, CONFIRMED_META_KEY, (err, reply) => {
                if (err) {
                    //if error setting the usermeta, then send error.
                    return sendError(req, new restifyErrors.InternalError({
                        code: 'InternalError',
                        message: "Error occured while getting meta for confirmedOn"
                    }), next);
                }

                let confirmations = {};
                if (reply !== null && reply !== undefined && reply !== '') {
                    try {
                        confirmations = JSON.parse(reply);
                    } catch (ex) {
                        log.warn({ req_id: params.req_id, ex }, `error when parsing usermeta ${CONFIRMED_META_KEY}`);
                    }
                }
                confirmations[email] = (+new Date());
                this.usermetaClient.set(params, CONFIRMED_META_KEY, JSON.stringify(confirmations), (err, reply) => {
                    if (err) {
                        //if error setting the usermeta, then send error.
                        return sendError(req, new restifyErrors.InternalError({
                            code: 'InternalError',
                            message: "Error occured while updating meta"
                        }), next);
                    }

                    //success, send response.
                    res.send(200, { ok: true, isValid });
                    next();
                });
            });
        }
        else {
            res.send(200, { ok: true, isValid });
            next();
        }
    }
}