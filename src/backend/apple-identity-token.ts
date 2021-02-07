import * as jwt from 'jsonwebtoken';
import base64url from 'base64url';
import { applePublicKey } from './apple-public-key';
import log from '../log';

const APPLE_IDENTITY_URL = 'https://appleid.apple.com';

const iosBundleId = process.env.IOS_BUNDLE_ID;
 
export interface AppleIdentityToken {
    header: {
        /** The algorithm used to sign the token. For Sign in with Apple, use ES256. */
        alg: string; // ES256

        /** A 10-character key identifier generated for the Sign in with Apple private key associated with your developer account. */
        kid: string;
    }
    claim: {
        /** The issuer registered claim identifies the principal that issued the client secret. Since the client secret belongs to your developer team, use your 10-character Team ID associated with your developer account. */
        iss: string;
	    
        /** The issued at registered claim indicates the time at which you generated the client secret, in terms of the number of seconds since Epoch, in UTC. */
        iat: number;
        
        /** The expiration time registered claim identifies the time on or after which the client secret will expire. The value must not be greater than 15777000 (6 months in seconds) from the Current Unix Time on the server. */
        exp: number;
        
        /** The audience registered claim identifies the intended recipient of the client secret. Since the client secret is sent to the validation server, use https://appleid.apple.com. */
        aud: string;
            
        /** The subject registered claim identifies the principal that is the subject of the client secret. Since this client secret is meant for your application, use the same value as client_id. The value is case-sensitive. */
        sub: string;

        c_hash?: string;
        email?: string;
        email_verified?: "true" | "false";
        auth_time?: number;
    }
}

export async function validateIdentityToken (identityToken: string): Promise<AppleIdentityToken | string> {
    if (!iosBundleId) return 'iOS Bundle ID is not set';
    try {
        const decoded: AppleIdentityToken = jwt.decode(identityToken, { complete: true });
        log.info({ decoded }, 'jwt decoded');
        const { kid, alg } = decoded.header;
        const publicKey = await applePublicKey(kid);
        const claim: AppleIdentityToken['claim'] = jwt.verify(identityToken, publicKey, { algorithms: [alg] });
        if (claim.iss !== APPLE_IDENTITY_URL) throw new Error('Apple identity token wrong issuer: ' + claim.iss);
        if (claim.aud !== iosBundleId) throw new Error('Apple identity token wrong audience: ' + claim.aud);
        if (claim.exp * 1000 < +new Date()) throw new Error('Apple identity token expired');
        return {
            header: decoded.header,
            claim,
        };
    } catch (err) {
        return err.message;
    }
}