'use strict'

_ = require 'lodash'

# create reusable transporter object using the SMTP transport
createTransport = ({
  from = process.env.MAILER_SEND_FROM
  subject = process.env.MAILER_SEND_SUBJECT
  text = process.env.MAILER_SEND_TEXT
  html = process.env.MAILER_SEND_HTML

  nodemailer = require 'nodemailer'
  log = require("./log").child(module:"mailer")
} = {}) ->

  env = (x) -> process.env["MAILER_#{x.toUpperCase()}"]

  options = {}
  if env('PORT')
    options.port = +(env('PORT') || null)
  if env('HOST')
    options.host = env('HOST') || 'localhost'
  if env('SECURE')
    options.secure = env('SECURE') == 'true'
  if env('AUTH_USER') and env('AUTH_PASS')
    options.auth =
      user: env('AUTH_USER')
      pass: env('AUTH_PASS')
  if env('IGNORE_TLS')
    options.ignoreTLS = env(IGNORE_TLS) == 'true'
  if env('NAME')
    options.name = env('NAME')
  if env('LOCAL_ADDRESS')
    options.localAddress = env('LOCAL_ADDRESS')
  if env('CONNECTION_TIMEOUT')
    options.connectionTimeout = env('CONNECTION_TIMEOUT')
  if env('GREETING_TIMEOUT')
    options.greetingTimeout = env('GREETING_TIMEOUT')
  if env('SOCKET_TIMEOUT')
    options.socketTimeout = env('SOCKET_TIMEOUT')
  if env('DEBUG')
    options.debug = env('DEBUG') == 'true'
  if env('AUTH_METHOD')
    options.authMethod = env('AUTH_METHOD')
  options.logger = log

  defaults = { from, subject, text, html }
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
