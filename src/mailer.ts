/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'lodash';
const env = x => process.env[`MAILER_${x.toUpperCase()}`];

// create reusable transporter object using the SMTP transport
const createTransport = function(...args) {

  const val = args[0],
        obj = val != null ? val : {},
        val1 = obj.nodemailer,
        nodemailer = val1 != null ? val1 : require('nodemailer'),
        val2 = obj.from,
        from = val2 != null ? val2 : process.env.MAILER_SEND_FROM,
        val3 = obj.subject,
        subject = val3 != null ? val3 : process.env.MAILER_SEND_SUBJECT,
        val4 = obj.text,
        text = val4 != null ? val4 : process.env.MAILER_SEND_TEXT,
        val5 = obj.html,
        html = val5 != null ? val5 : process.env.MAILER_SEND_HTML,
        val6 = obj.port,
        port = val6 != null ? val6 : +(env('PORT') || 0),
        val7 = obj.host,
        host = val7 != null ? val7 : env('HOST'),
        val8 = obj.secure,
        secure = val8 != null ? val8 : env('SECURE') === 'true',
        val9 = obj.auth,
        auth = val9 != null ? val9 : {
          user: env('AUTH_USER'),
          pass: env('AUTH_PASS')
        },
        val10 = obj.ignoreTLS,
        ignoreTLS = val10 != null ? val10 : env('IGNORE_TLS') === 'true',
        val11 = obj.name,
        name = val11 != null ? val11 : env('NAME'),
        val12 = obj.localAddress,
        localAddress = val12 != null ? val12 : env('LOCAL_ADDRESS'),
        val13 = obj.connectionTimeout,
        connectionTimeout = val13 != null ? val13 : env('CONNECTION_TIMEOUT'),
        val14 = obj.greetingTimeout,
        greetingTimeout = val14 != null ? val14 : env('GREETING_TIMEOUT'),
        val15 = obj.socketTimeout,
        socketTimeout = val15 != null ? val15 : env('SOCKET_TIMEOUT'),
        val16 = obj.debug,
        debug = val16 != null ? val16 : env('DEBUG') === 'true',
        val17 = obj.authMethod,
        authMethod = val17 != null ? val17 : env('AUTH_METHOD'),
        val18 = obj.log,
        log = val18 != null ? val18 : require("./log").child({module:"mailer"});
  const options = {};
  if (port) { options.port = port; }
  if (host) { options.host = host; }
  options.secure = secure;
  if (auth && auth.user && auth.pass) {
    options.auth = {
      user,
      pass
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
