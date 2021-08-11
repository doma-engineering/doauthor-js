export const main = async () => {
    window.sodium = {
        onload: (sodium) => {
            const maybePort = () => {
                if (window.location.port) {
                    return ':' + window.location.port
                } else {
                    return ''
                }
            };

            window.doauthor = {
                server: window.location.protocol + '//' + window.location.hostname + maybePort(),
                saltSize: 16,
                hashSize: 32,
                keySize: 32,
                defaultParams: {
                    opsLimit: sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
                    memLimit: 5 * sodium.crypto_pwhash_MEMLIMIT_MIN
                },
            };

            window.doauthor.crypto = {};

            window.doauthor.crypto.show = (bs) => {
                return sodium.to_base64(bs, sodium.base64_variants["URLSAFE"]);
            }

            window.doauthor.crypto.read = (s) => {
                return sodium.from_base64(s, sodium.base64_variants["URLSAFE"]);
            }

            window.doauthor.crypto.slipConfig = () => {
                return {
                    ops: doauthor.defaultParams.opsLimit,
                    mem: doauthor.defaultParams.memLimit,
                    saltSize: doauthor.saltSize
                };
            }

            window.doauthor.crypto.mainKey = (pass) => {
                const slipMaybe = localStorage.getItem("slip");
                if (slipMaybe) {
                    return doauthor.crypto.mainKeyReproduce2(pass, JSON.parse(slipMaybe));
                } else {
                    let [mkey, slip] = doauthor.crypto.mainKeyInit2(pass, doauthor.crypto.slipConfig());
                    localStorage.setItem("slip", JSON.stringify(slip));
                    return mkey;
                }
            }

            window.doauthor.crypto.mainKeyInit2 = (pass, slipConfig) => {
                const slip1 = { ...slipConfig, salt: doauthor.crypto.show(sodium.randombytes_buf(slipConfig.saltSize)) };
                const mkey = doauthor.crypto.mainKeyReproduce2(pass, slip1);
                return [mkey, slip1];
            }

            window.doauthor.crypto.mainKeyReproduce2 = (pass, slip) => {
                let { ops, mem, salt } = slip;
                const mkey = sodium.crypto_pwhash(
                    doauthor.hashSize, // kinda hardcoded but ok
                    pass,
                    doauthor.crypto.read(salt),
                    ops,
                    mem,
                    sodium.crypto_pwhash_ALG_DEFAULT
                );
                return mkey;
            }

            window.doauthor.crypto.deriveSigningKeypair = (mkey, n) => {
                const mkd = sodium.crypto_kdf_derive_from_key(doauthor.keySize, n, "signsign", mkey);
                let { publicKey, privateKey } = sodium.crypto_sign_seed_keypair(mkd);
                return { public: publicKey, secret: privateKey };
            }

            window.doauthor.crypto.sign = (msg, kp) => {
                return { public: kp.public, signature: sodium.crypto_sign_detached(msg, kp.secret) };
            }

            window.doauthor.crypto.verify = (msg, detached) => {
                return sodium.crypto_sign_verify_detached(detached.signature, msg, detached.public);
            }

            window.doauthor.crypto.bland_hash = (msg) => {
                return doauthor.crypto.show(sodium.crypto_generichash(doauthor.hashSize, msg));
            }

            /*
             * TODO:
             * console.log's are left in to show what the author
             * checked. They are NOT A SUFFICIENT EVIDENCE that this
             * function does what it's supposed to do and proper
             * invariant testing and audit are absolutely necessary to
             * run it in production.
             */
            function _canonicalise(x) {
                // console.log("Canonicalising ", x)
                if (typeof (x) === "string" || typeof (x) === "number" || typeof (x) === "bigint") {
                    // console.log("It's just a value", x)
                    return x;
                } else if (typeof (x) === "object") {
                    if (Array.isArray(x) === true) {
                        return x.map(x => _canonicalise(x));
                    } else {
                        var ks = Object.keys(x);
                        const x1 = { ...x };
                        ks.sort();
                        var y = new Array();
                        for (let i = 0; i < ks.length; i++) {
                            // console.log("Got object, working on adding **", ks[i], "**, the", i, "th element of", ks)
                            y.push([ks[i], _canonicalise(x1[ks[i]], y)]);
                            // console.log("Accumulator so far:", [...y])
                        }
                        return y;
                    }
                }
            };

            window.doauthor.crypto.canonicalise = _canonicalise;

            window.doauthor.credential = {};

            window.doauthor.credential.proofless = (cred) => {
                ctxs = cred['@context'];
                let { type, issuer, issuanceDate, credentialSubject } = cred;
                return { '@context': ctxs, type: type, issuer: issuer, issuanceDate: issuanceDate, credentialSubject: credentialSubject };
            };

            window.doauthor.credential.prooflessJSON = (cred) => {
                return JSON.stringify(
                    doauthor.crypto.canonicalise(
                        doauthor.credential.proofless(cred)
                    )
                );
            };

            window.doauthor.credential.verify = (cred, pk) => {
                return doauthor.crypto.verify(
                    doauthor.credential.prooflessJSON(cred),
                    {
                        public: pk,
                        signature: doauthor.crypto.read(cred.proof.signature)
                    }
                );
            };

            window.doauthor.credential.verify64 = (cred, pk) => {
                return doauthor.credential.verify(cred, doauthor.crypto.read(pk));
            };

            window.doauthor.util = {};

            window.doauthor.util.prettyPrint = (x) => JSON.stringify(x, null, 2);

            window.__doauthorHasLoaded__ = true;
        }
    }
    return new Promise(observeMany(() => [window.__doauthorHasLoaded__]));
}

export const observePeriodMsec = 30;

export const observeMany = (varsF, timeLeft) => (resolveF, rejectF) => {
    //console.log("tick", varsF());
    var timeLeft1 = undefined;
    if (varsF().reduce((acc, v) => acc && v, true)) {
        return resolveF(varsF());
    }
    if (typeof timeLeft !== 'undefined') {
        if (timeLeft > 0) {
            return rejectF(new Error("Observer timed out"));
        } else {
            timeLeft1 = timeLeft - observePeriodMsec;
        }
    }
    return setTimeout(
        observeMany(varsF, timeLeft1).bind(this, resolveF, rejectF),
        observePeriodMsec
    );
}
