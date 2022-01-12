import { expect } from 'chai';
import totp from '../src/email-confirmation/totp';

const email = 'test@teset.com';
const email2 = 'test22@teset.com';

describe('totp generation and verification', () => {

    describe('generate TOTP', () => {

        it('generate a code', (done) => {
            const token = totp.generate(email);
            expect(token).to.be.not.null;
            expect(token).to.be.not.empty;
            done();
        });

        it('generate a code with a defined number of digits', (done) => {
            const token = totp.generate(email, 10, 8);
            expect(token.length).to.be.equals(8);
            done();
        });

        it('generate different code each 1 seconds', (done) => {
            const token1 = totp.generate(email, 1, 8);
            setTimeout(() => {
                const token2 = totp.generate(email, 1, 8);
                expect(token1).to.be.not.equals(token2);
                done();
            }, 1200);
        });

    });

    describe('verify TOTP', () => {

        it('verify a code', (done) => {
            const token = totp.generate(email, 10, 8);
            const isValid = totp.verify(email, token, 10, 8);
            expect(isValid).to.be.true;
            done();
        });

        it('fail to verify an old code', (done) => {
            const token = totp.generate(email, 1, 8);
            setTimeout(() => {
                const isValid = totp.verify(email, token, 1, 8);
                expect(isValid).to.be.false;
                done();
            }, 1200);
        });

        it('fail to verify whith different email address', (done) => {
            const token = totp.generate(email, 10, 8);
            const isValid = totp.verify(email2, token, 10, 8);
            expect(isValid).to.be.false;
            done();
        });


    });

});