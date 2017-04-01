#
# special email domains
#

guestEmailDomain = "#{process.env.GUEST_EMAIL_DOMAIN || '@'}"
noEmailDomain = "#{process.env.NO_EMAIL_DOMAIN || 'email-not-provided.local'}"

isGuestEmail = (email) -> (email && email.indexOf('@' + guestEmailDomain) > 0)
isNoEmail = (email) -> (!email || email.indexOf('@' + noEmailDomain) > 0)

module.exports = {
  guestEmailDomain
  noEmailDomain
  isGuestEmail
  isNoEmail
}
