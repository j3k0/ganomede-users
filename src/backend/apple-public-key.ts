import NodeRSA from 'node-rsa';
import axios from 'axios';

const APPLE_IDENTITY_URL = 'https://appleid.apple.com';
const CACHE_DURATION_MS = 5 * 60 * 1000;

/** An object that defines a single Apple JSON Web Key. */
interface ApplePublicKey {
    /** The encryption algorithm used to encrypt the token. */
    alg: string;

    /** The exponent value for the RSA public key. */
    e: string;

    /** A 10-character identifier key, obtained from your developer account. */
    kid: string;

    /** The key type parameter setting. This must be set to "RSA". */
    kty: string;

    /** The modulus value for the RSA public key. */
    n: string;

    /** The intended use for the public key. */
    use: string;
}

let appleKeysCache: ApplePublicKey[] = [];
let appleKeysUpdateTime = 0;
async function applePublicKeys(): Promise<ApplePublicKey[]> {
    if (+new Date() - appleKeysUpdateTime < CACHE_DURATION_MS) {
        return appleKeysCache;
    }
    const url = APPLE_IDENTITY_URL + '/auth/keys';
    const ret = await axios.get<{ keys: ApplePublicKey[] }>(url);
    if (ret.status == 200 && ret.data?.keys?.length > 0) {
        appleKeysUpdateTime = +new Date();
        appleKeysCache = ret.data.keys;
        return ret.data.keys;
    }
    return [];
}

export async function applePublicKey(kid: string): Promise<string | undefined> {
    const keys = await applePublicKeys();
    const key = keys.find(key => key.kid === kid);
    if (!key) return;
    const pubKey = new NodeRSA();
    pubKey.importKey({ n: Buffer.from(key.n, 'base64'), e: Buffer.from(key.e, 'base64') }, 'components-public');
    return pubKey.exportKey('public');
}
