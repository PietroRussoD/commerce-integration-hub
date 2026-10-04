import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

const HOST = "0.0.0.0";
const ISSUER = "http://host.docker.internal:8095";
const AUDIENCE = "integration-hub-operator-api";
const KEY_ID = `local-replay-demo-${randomUUID()}`;

const { privateKey, publicKey } = await generateKeyPair("RS256");
const publicJwk = {
    ...(await exportJWK(publicKey)),
    alg: "RS256",
    kid: KEY_ID,
    use: "sig"
};
const server = createServer((request, response) => {
    if (request.method !== "GET") {
        response.writeHead(404).end();
        return;
    }

    if (request.url === "/token") {
        if (!isLoopbackAddress(request.socket.remoteAddress)) {
            response.writeHead(403).end();
            return;
        }
        void issueToken().then((token) => {
            response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            response.end(`${token}\n`);
        });
        return;
    }
    if (request.url !== "/jwks") {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
});

server.listen(8095, HOST, () => {
    process.stdout.write(`Local operator issuer ready. JWKS: ${ISSUER}/jwks\n`);
    process.stdout.write("Get a fresh 30-minute admin token from http://localhost:8095/token\n");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
}

function issueToken(): Promise<string> {
    return new SignJWT({ groups: ["operator", "platform-admin"] })
        .setAudience(AUDIENCE)
        .setExpirationTime("30m")
        .setIssuedAt()
        .setIssuer(ISSUER)
        .setSubject("local-replay-demo-admin")
        .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
        .sign(privateKey);
}

function isLoopbackAddress(address: string | undefined): boolean {
    return address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}
