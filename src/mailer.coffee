'use strict'

_ = require 'lodash'
env = (x) -> process.env["MAILER_#{x.toUpperCase()}"]

# create reusable transporter object using the SMTP transport
createTransport = ({
  nodemailer = require 'nodemailer'

  from = process.env.MAILER_SEND_FROM
  subject = process.env.MAILER_SEND_SUBJECT
  text = process.env.MAILER_SEND_TEXT
  html = process.env.MAILER_SEND_HTML

  port = +(env('PORT') || 0)
  host = env('HOST')
  secure = env('SECURE') == 'true'
  auth =
    user: env('AUTH_USER')
    pass: env('AUTH_PASS')
  ignoreTLS = env('IGNORE_TLS') == 'true'
  name = env('NAME')
  localAddress = env('LOCAL_ADDRESS')
  connectionTimeout = env('CONNECTION_TIMEOUT')
  greetingTimeout = env('GREETING_TIMEOUT')
  socketTimeout = env('SOCKET_TIMEOUT')
  debug = env('DEBUG') == 'true'
  authMethod = env('AUTH_METHOD')

  log = require("./log").child(module:"mailer")
} = {}) ->

  options = {}
  options.port = port if port
  options.host = host if host
  options.secure = secure
  if auth and auth.user and auth.pass
    options.auth =
      user: user
      pass: pass
  options.ignoreTLS = ignoreTLS if ignoreTLS
  options.name = name if name
  options.localAddress = localAddress if localAddress
  options.connectionTimeout = connectionTimeout if connectionTimeout
  options.greetingTimeout = greetingTimeout if greetingTimeout
  options.socketTimeout = socketTimeout if socketTimeout
  options.debug = debug
  options.authMethod = authMethod if authMethod
  options.logger = log

  defaults = { from, subject, text, html }
  log.debug {options}, 'nodemailer.createTransport'
  transport = nodemailer.createTransport options

  defaults: defaults
  sendMail: (options, cb) ->
    req_id = undefined
    if options.req_id
      req_id = options.req_id
      delete options.req_id
    mailOptions = _.extend({}, defaults, options)
    log.debug { mailOptions, req_id }, "mailer.sendMail"
    mailCallback = (err, info) ->
      if (err)
        log.error err, "failed to send email"
      else if (info)
        { messageId, response } = info
        log.info {messageId, response}, "message sent"
      else
        console.error "no error and no info?"
      cb err, info
    transport.sendMail mailOptions, mailCallback

module.exports = { createTransport }

# vim: ts=2:sw=2:et:
