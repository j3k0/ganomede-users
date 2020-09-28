//
// special email domains
//

const guestEmailDomain = `${process.env.GUEST_EMAIL_DOMAIN || '@'}`;
const noEmailDomain = `${process.env.NO_EMAIL_DOMAIN || 'email-not-provided.local'}`;

const isGuestEmail = email => email && (email.indexOf('@' + guestEmailDomain) > 0);
const isNoEmail = email => !email || (email.indexOf('@' + noEmailDomain) > 0);

export default {
  guestEmailDomain,
  noEmailDomain,
  isGuestEmail,
  isNoEmail
};
