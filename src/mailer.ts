import * as _ from 'lodash';
import nodemailerMod, { Transporter, Transport, TransportOptions } from 'nodemailer';
import logMod from './log';
import Logger from 'bunyan';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import SMTPConnection from 'nodemailer/lib/smtp-connection';

const env = (x: string): string|undefined => process.env[`MAILER_${x.toUpperCase()}`];
const envNumber = (x: string) => +(env(x) || '');

export interface MailerModule {
  createTransport(transport: Transport | TransportOptions, defaults?: TransportOptions): Transporter;
  createTransport(transport?: SMTPTransport | SMTPTransport.Options | string, defaults?: SMTPTransport.Options): Transporter;
}

/** Options to the sendMail() function */
export type MailerSendOptions = {
  /** Origin address. Optional as there is a global default value. */
  from?: string;
  /** Destination address */
  to?: string;
  /** Input request identifier - for tracking the origin of emails */
  req_id?: string;
  /** Subject line */
  subject?: string;
  /** Content as plain text */
  text?: string;
  /** Content as html */
  html?: string;
}

export type CreatedMailerTransportResult = {
  defaults: MailerSendOptions;
  sendMail(options: MailerSendOptions, cb: (err: any, info: any) => void): void;
}

export type CreateMailerTransport = (obj?: MailerOptions) => CreatedMailerTransportResult;

export interface MailerOptions {
  nodemailer?: MailerModule;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  port?: number;
  host?: string;
  secure?: boolean;
  ignoreTLS?: boolean;
  name?: string;
  localAddress?: string;
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  debug?: true;
  authMethod?: string;
  log?: Logger;
  auth?: SMTPConnection.AuthenticationType;
};

// create reusable transporter object using the SMTP transport
const createTransport: CreateMailerTransport = function (obj: MailerOptions = {}) {

  const nodemailer = obj.nodemailer || nodemailerMod;
  const from = obj.from ?? process.env.MAILER_SEND_FROM;
  const subject = obj.subject ?? process.env.MAILER_SEND_SUBJECT;
  const text = obj.text ?? process.env.MAILER_SEND_TEXT;
  const html = obj.html ?? process.env.MAILER_SEND_HTML;
  const port = obj.port ?? +(env('PORT') || 0);
  const host = obj.host ?? env('HOST');
  const secure = obj.secure ?? env('SECURE') === 'true';
  const auth = obj.auth ?? {
    user: env('AUTH_USER'),
    pass: env('AUTH_PASS')
  };
  const ignoreTLS = obj.ignoreTLS ?? env('IGNORE_TLS') === 'true';
  const name = obj.name ?? env('NAME');
  const localAddress = obj.localAddress ?? env('LOCAL_ADDRESS');
  const connectionTimeout = obj.connectionTimeout ?? envNumber('CONNECTION_TIMEOUT');
  const greetingTimeout = obj.greetingTimeout ?? envNumber('GREETING_TIMEOUT');
  const socketTimeout = obj.socketTimeout ?? envNumber('SOCKET_TIMEOUT');
  const debug = obj.debug ?? env('DEBUG') === 'true';
  const authMethod = obj.authMethod ?? env('AUTH_METHOD');
  const log = obj.log ?? logMod.child({module:"mailer"});
  const options: SMTPTransport.Options = {}; /* = {
    auth: {
      user: undefined,
      pass: undefined,
    },
    port: undefined,
    host: undefined,
    secure: undefined,
    ignoreTLS: undefined,
    name: undefined,
    localAddress: undefined,
    connectionTimeout: undefined,
    greetingTimeout: undefined,
    socketTimeout: undefined,
    debug: undefined,
    authMethod: undefined,
    logger: undefined,
  }; */
  if (port) { options.port = port; }
  if (host) { options.host = host; }
  options.secure = secure;
  if (auth && 'user' in auth && 'pass' in auth && auth.user && auth.pass) {
    options.auth = {
      user: auth.user,
      pass: auth.pass
    };
  }
  if (ignoreTLS) { options.ignoreTLS = ignoreTLS; }
  if (name) { options.name = name; }
  if (localAddress) { options.localAddress = localAddress; }
  if (connectionTimeout) { options.connectionTimeout = connectionTimeout; }
  if (greetingTimeout) { options.greetingTimeout = greetingTimeout; }
  if (socketTimeout) { options.socketTimeout = socketTimeout; }
  options.debug = debug;
  if (authMethod) { options.authMethod = authMethod; }
  options.logger = log;

  const defaults: MailerSendOptions = { from, subject, text, html };
  log.debug({options}, 'nodemailer.createTransport');
  const transport = nodemailer.createTransport(options);

  return {
    defaults,
    sendMail(options: MailerSendOptions, cb: (err: any, info: any) => void) {
      const req_id = options.req_id;
      if (req_id) {
        delete options.req_id;
      }
      const mailOptions = _.extend({}, defaults, options);
      log.debug({ mailOptions, req_id }, "mailer.sendMail");
      const mailCallback = function(err, info) {
        if (err) {
          log.error(err, "failed to send email");
        } else if (info) {
          const { messageId, response } = info;
          log.info({messageId, response}, "message sent");
        } else {
          console.error("no error and no info?");
        }
        return cb(err, info);
      };
      return transport.sendMail(mailOptions, mailCallback);
    }
  };
};

export default { createTransport };

// vim: ts=2:sw=2:et:
