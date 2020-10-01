/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from 'lodash';
import * as nodemailerMod from 'nodemailer';
import logMod from './log';
const env = (x: string): string|undefined => process.env[`MAILER_${x.toUpperCase()}`];

// create reusable transporter object using the SMTP transport
const createTransport = function(...args) {

  const obj = args[0] ?? {};
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
  const connectionTimeout = obj.connectionTimeout ?? env('CONNECTION_TIMEOUT');
  const greetingTimeout = obj.greetingTimeout ?? env('GREETING_TIMEOUT');
  const socketTimeout = obj.socketTimeout ?? env('SOCKET_TIMEOUT');
  const debug = obj.debug ?? env('DEBUG') === 'true';
  const authMethod = obj.authMethod ?? env('AUTH_METHOD');
  const log = obj.log ?? logMod.child({module:"mailer"});
  const options = {
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
  };
  if (port) { options.port = port; }
  if (host) { options.host = host; }
  options.secure = secure;
  if (auth && auth.user && auth.pass) {
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

  const defaults = { from, subject, text, html };
  log.debug({options}, 'nodemailer.createTransport');
  const transport = nodemailer.createTransport(options);

  return {
    defaults,
    sendMail(options, cb) {
      let req_id = undefined;
      if (options.req_id) {
        ({
          req_id
        } = options);
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
