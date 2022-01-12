/**
 * file responsible for time based token generation.
 */

import { totp } from 'otplib';
import { totpConfig } from '../config';

/**
 * prepare totp object and setting the params.
 * @param period optional time in seconds that token will stay alive.
 * @param digits optional number of digits of the token generated.
 * @returns totp object responsible for generation and verification.
 */
const prepareTOTPoptions = (period?: number, digits?: number) => {
    let options = Object.assign({}, totp.options);
    options.step = period || totpConfig.period;
    options.digits = digits || totpConfig.digits;
    totp.options = options;
    return totp;
};

/**
 * generate token for a user email address.
 * @param email required for generating the token
 * @param period optional time in seconds that token will stay alive.
 * @param digits optional number of digits of the token generated.
 * @returns string token generate
 */
const generate = (email: string, period?: number, digits?: number) => {
    const secret = email + totpConfig.secretKey;
    const token = prepareTOTPoptions(period, digits).generate(secret);
    return token;
};

/**
 * 
 * @param email required for verifying the token
 * @param token token generated before.
 * @param period optional time in seconds that token will stay alive.
 * @param digits optional number of digits of the token generated.
 * @returns boolean if verification is successfull.
 */
const verify = (email: string, token: string, period?: number, digits?: number) => {
    const secret = email + totpConfig.secretKey;
    return prepareTOTPoptions(period, digits).verify({ token, secret });
};

export default { generate, verify };