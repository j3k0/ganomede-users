'use strict'

_ = require 'lodash'

# create reusable transporter object using the SMTP transport
createTransport = ({
  service = process.env.MAILER_SERVICE
  user = process.env.MAILER_AUTH_USER
  pass = process.env.MAILER_AUTH_PASS

  from = process.env.MAILER_SEND_FROM
  subject = process.env.MAILER_SEND_SUBJECT
  text = process.env.MAILER_SEND_TEXT
  html = process.env.MAILER_SEND_HTML

  nodemailer = require 'nodemailer'
  log = require("./log").child(module:"mailer")
} = {}) ->

  defaults = { from, subject, text, html }
  auth = { user, pass }
  transport = nodemailer.createTransport { service, auth }

  defaults: defaults
  sendMail: (options, cb) ->
    mailOptions = _.extend {}, defaults, options
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
