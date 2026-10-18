import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createOperatorJwtFixture } from "../test/support/operator-jwt-fixture.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const chart = `${root}/deploy/charts/commerce-integration-hub`;
const name = `operator-jwks-${randomUUID().slice(0, 8)}`;
const issuer = `http://${name}.hub.svc.cluster.local:8095`;
const audience = "integration-hub-operator-api";
const actor = "synthetic-security-verification-admin";
const reason = "Synthetic protected-profile acceptance verification";
const releaseDescription = `Synthetic operator security verification: ${name}`;
const startedAt = new Date().toISOString();
const cancellation = new AbortController();
const forwards: ChildProcess[] = [];
let cleaningUp = false;
let expectedRevision: number | undefined;
let originalRevision: number | undefined;
let fixtureInstalled = false;
let releaseChanged = false;
let mesh = false;
let coreUrl = "";
let gatewayUrl = "";

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => cancellation.abort());
}

// Positional arguments carry cluster commands; the shared guard checks the
// dedicated kubeconfig and local API server before each operation.
function cluster(operation: "kube" | "helm_cmd" | "install_chart", args: readonly string[], input = ""): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", 'source "$HUB_VERIFY_ROOT/scripts/k8s/lib.sh"; "$HUB_VERIFY_OPERATION" "$@"', "operator-security", ...args], {
            env: { ...process.env, HUB_VERIFY_ROOT: root, HUB_VERIFY_OPERATION: operation },
            stdio: ["pipe", "pipe", "pipe"],
            ...(cleaningUp ? {} : { signal: cancellation.signal })
        });
        let output = "";
        child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        // Never forward raw command diagnostics: logs and secret reads may carry
        // credential material. Failures identify the operation only.
        child.stderr.resume();
        child.on("error", () => reject(new Error(`Could not execute ${operation}`)));
        child.on("close", (code) => code === 0
            ? resolve(output.trim())
            : reject(new Error(`Local cluster operation failed: ${operation} ${args.slice(0, 2).join(" ")}`)));
        child.stdin.on("error", () => { /* The process error is reported on close. */ });
        child.stdin.end(input);
    });
}

function check(description: string, actual: unknown, expected: unknown): void {
    if (actual !== expected) {
        throw new Error(`${description}: expected ${String(expected)}, got ${String(actual)}`);
    }
    console.log(`  ok  ${description}`);
}

async function helmRelease(): Promise<{ version: number; info: { description: string } }> {
    return JSON.parse(await cluster("helm_cmd", ["status", "hub", "-n", "hub", "-o", "json"])) as { version: number; info: { description: string } };
}

async function gatewaySql(query: string): Promise<string> {
    const primary = await cluster("kube", ["-n", "hub-data", "get", "cluster", "gateway", "-o", "jsonpath={.status.currentPrimary}"]);
    return cluster("kube", ["-n", "hub-data", "exec", "-i", primary, "-c", "postgres", "--", "psql", "-U", "postgres", "-d", "connector_gateway", "-qAt", "-v", "ON_ERROR_STOP=1"], query);
}

async function localPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Could not reserve a local port");
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return address.port;
}

async function forward(namespace: string, service: string, remotePort: number): Promise<string> {
    const port = await localPort();
    // Like lib.sh's start_port_forward, exec preserves kubectl's PID for cleanup.
    const child = spawn("bash", ["-c", 'source "$HUB_VERIFY_ROOT/scripts/k8s/lib.sh"; assert_local_cluster; exec kubectl --kubeconfig "$HUB_KUBECONFIG" --context "$KUBE_CONTEXT" "$@"', "operator-forward", "-n", namespace, "port-forward", "--address", "127.0.0.1", `svc/${service}`, `${port}:${remotePort}`], {
        env: { ...process.env, HUB_VERIFY_ROOT: root }, stdio: "ignore"
    });
    forwards.push(child);
    const url = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        cancellation.signal.throwIfAborted();
        if (child.exitCode !== null) throw new Error("Local port-forward stopped");
        try {
            await fetch(url, { signal: AbortSignal.timeout(500) });
            return url;
        } catch { await delay(500); }
    }
    throw new Error("Local port-forward did not become ready");
}

function stopForwards(): void {
    for (const child of forwards.splice(0)) child.kill("SIGTERM");
}

async function connect(): Promise<void> {
    if (mesh) {
        gatewayUrl = await forward("hub-ingress", "hub-ingress-istio", 80);
        coreUrl = gatewayUrl;
    } else {
        gatewayUrl = await forward("hub", "connector-gateway", 8081);
        coreUrl = await forward("hub", "integration-core", 8080);
    }
}

async function request(description: string, url: string, expected: number, token?: string, command?: { key: string; reason: string }): Promise<Response> {
    const response = await fetch(url, {
        signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(10_000)]),
        headers: {
            ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
            ...(command === undefined ? {} : { "content-type": "application/json", "idempotency-key": command.key })
        },
        ...(command === undefined ? {} : { method: "POST", body: JSON.stringify({ reason: command.reason }) })
    });
    check(description, response.status, expected);
    if (expected === 401) check(`${description} bearer challenge`, /^Bearer(?:\s|$)/i.test(response.headers.get("www-authenticate") ?? ""), true);
    return response;
}

async function demoReads(): Promise<void> {
    await request("demo Core read", `${coreUrl}/api/v1/operator/orders`, 200);
    await request("demo Gateway read", `${gatewayUrl}/api/v1/operator/deliveries`, 200);
}

async function installFixture(jwks: unknown): Promise<void> {
    const deployment = JSON.parse(await cluster("kube", ["-n", "hub", "get", "deployment", "connector-gateway", "-o", "json"])) as {
        spec: { template: { spec: { containers: { name: string; image: string }[] } } };
    };
    const image = deployment.spec.template.spec.containers.find(container => container.name === "connector-gateway")?.image;
    if (image === undefined) throw new Error("Gateway image not found");
    const discovery = { issuer, jwks_uri: `${issuer}/jwks`, authorization_endpoint: `${issuer}/unsupported`, token_endpoint: `${issuer}/unsupported`, response_types_supported: ["token"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] };
    const server = `const {createServer}=require('node:http'); const {readFileSync}=require('node:fs');
const documents={'/jwks':readFileSync('/fixture/jwks.json'),'/.well-known/openid-configuration':readFileSync('/fixture/discovery.json')};
createServer((req,res)=>{const body=documents[req.url];if(req.method!=='GET'||!body){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'application/json'}).end(body);}).listen(8095,'0.0.0.0');`;
    const items: unknown[] = [
        { apiVersion: "v1", kind: "ConfigMap", metadata: { name, namespace: "hub" }, data: { "server.cjs": server, "jwks.json": JSON.stringify(jwks), "discovery.json": JSON.stringify(discovery) } },
        { apiVersion: "v1", kind: "Service", metadata: { name, namespace: "hub" }, spec: { selector: { "app.kubernetes.io/name": name }, ports: [{ port: 8095, targetPort: 8095 }] } },
        { apiVersion: "v1", kind: "Pod", metadata: { name, namespace: "hub", labels: { "app.kubernetes.io/name": name } }, spec: {
            serviceAccountName: "hub-test-client", automountServiceAccountToken: false,
            securityContext: { runAsNonRoot: true, runAsUser: 65532, seccompProfile: { type: "RuntimeDefault" } },
            containers: [{ name: "jwks", image, imagePullPolicy: "IfNotPresent", args: ["/fixture/server.cjs"],
                ports: [{ containerPort: 8095 }], resources: { requests: { cpu: "10m", memory: "32Mi" }, limits: { memory: "128Mi" } },
                securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } },
                readinessProbe: { httpGet: { path: "/jwks", port: 8095 }, periodSeconds: 2 },
                volumeMounts: [{ name: "fixture", mountPath: "/fixture", readOnly: true }]
            }], volumes: [{ name: "fixture", configMap: { name } }]
        } }
    ];
    if (mesh) items.push({ apiVersion: "security.istio.io/v1", kind: "AuthorizationPolicy", metadata: { name, namespace: "hub" }, spec: {
        selector: { matchLabels: { "app.kubernetes.io/name": name } }, action: "ALLOW", rules: [{ from: [{ source: { principals: ["cluster.local/ns/hub/sa/integration-core", "cluster.local/ns/hub/sa/connector-gateway"] } }], to: [{ operation: { ports: ["8095"] } }] }]
    } });
    fixtureInstalled = true;
    await cluster("kube", ["apply", "-f", "-"], JSON.stringify({ apiVersion: "v1", kind: "List", items }));
    await cluster("kube", ["-n", "hub", "wait", "--for=condition=Ready", `pod/${name}`, "--timeout=120s"]);
}

async function syntheticReceipt(): Promise<string> {
    const secret = JSON.parse(await cluster("kube", ["-n", "hub", "get", "secret", "hub-synthetic", "-o", "json"])) as { data: { webhookKeyId: string; webhookSecretBase64: string } };
    const body = JSON.stringify({ eventId: `security-${randomUUID()}`, eventType: "order.created", order: {
        orderNumber: `SECURITY-${randomUUID()}`, currency: "EUR", totalCents: 1999,
        lines: [{ lineNumber: "1", productCode: "SKU-SECURITY-SYNTHETIC", quantity: 1, unitPriceCents: 1999 }]
    } });
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const webhookSecret = Buffer.from(Buffer.from(secret.data.webhookSecretBase64, "base64").toString(), "base64");
    const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${body}`).digest("hex");
    const url = `${gatewayUrl}/providers/marketplace-a/v1/order-webhooks`;
    const denied = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(10_000) });
    check("unsigned webhook denied", denied.status, 401);
    const accepted = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-webhook-key-id": Buffer.from(secret.data.webhookKeyId, "base64").toString(), "x-webhook-timestamp": timestamp, "x-webhook-signature": `v1=${signature}` }, body, signal: AbortSignal.timeout(10_000) });
    check("signed webhook accepted", accepted.status, 202);
    const receipt = await accepted.json() as { deliveryId: string };
    if (!/^[a-f0-9-]{36}$/.test(receipt.deliveryId)) throw new Error("Invalid synthetic receipt identity");
    return receipt.deliveryId;
}

async function verify(): Promise<void> {
    originalRevision = (await helmRelease()).version;
    expectedRevision = originalRevision;
    const values = JSON.parse(await cluster("helm_cmd", ["get", "values", "hub", "-n", "hub", "-o", "json"])) as { operatorSecurity?: { enabled?: boolean } } | null;
    if (values?.operatorSecurity?.enabled) throw new Error("Start this acceptance check from the local demo profile");
    // Read source credentials without exposing them in process arguments or output.
    const source = JSON.parse(await cluster("kube", ["-n", "hub", "get", "secret", "gateway-source-key", "-o", "json"])) as { data: { apiKey: string } };
    mesh = await cluster("kube", ["-n", "hub-ingress", "get", "gateway", "hub-ingress"]).then(() => true, () => false);
    await connect();
    await demoReads();
    stopForwards();

    const identity = await createOperatorJwtFixture({ audience, issuer, keyId: name, subject: actor });
    await installFixture(identity.jwks);
    const protectedValues = { operatorSecurity: { enabled: true, issuer, audience, coreAuthServerUrl: issuer, gatewayJwksUrl: `${issuer}/jwks`, clockSkewSeconds: 0 }, connectorGateway: { deliveryWorker: { enabled: false } } };
    releaseChanged = true;
    expectedRevision += 1;
    await cluster("helm_cmd", ["upgrade", "hub", chart, "-n", "hub", "--reset-then-reuse-values", "--values", "-", "--description", releaseDescription, "--wait", "--timeout", "5m"], JSON.stringify(protectedValues));
    expectedRevision += 1;
    await cluster("install_chart", ["--set", "connectorGateway.deliveryWorker.enabled=false", "--description", releaseDescription]);
    const updated = JSON.parse(await cluster("helm_cmd", ["get", "values", "hub", "-n", "hub", "-o", "json"])) as { operatorSecurity: { enabled: boolean } };
    check("local chart updates preserve protected settings", updated.operatorSecurity.enabled, true);
    await connect();

    const delivery = await syntheticReceipt();
    // As in the repository integration fixture, manufacture only this synthetic
    // delivery's exhausted state. The worker is paused to keep the proof stable.
    await gatewaySql(`BEGIN;
UPDATE inbound_deliveries SET status='EXHAUSTED', attempt_count=1, completed_at=CURRENT_TIMESTAMP,
error_code='CORE_REQUEST_TIMEOUT', safe_error_message='Synthetic acceptance timeout', updated_at=CURRENT_TIMESTAMP WHERE id='${delivery}';
INSERT INTO delivery_attempts (id,delivery_id,attempt_number,started_at,completed_at,outcome,error_code,duration_ms)
VALUES ('${randomUUID()}','${delivery}',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'RETRYABLE_FAILURE','CORE_REQUEST_TIMEOUT',0);
COMMIT;`);

    const operator = await identity.issueToken({ groups: ["operator"] });
    const admin = await identity.issueToken({ groups: ["platform-admin"] });
    const [header, payload, signature] = operator.split(".");
    if (!header || !payload || !signature) throw new Error("Could not prepare invalid-signature fixture");
    const invalidSignature = `${header}.${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    const cases = [
        { label: "anonymous", token: undefined, read: 401, replay: 401 },
        { label: "malformed", token: "not-a-jwt", read: 401, replay: 401 },
        { label: "invalid signature", token: invalidSignature, read: 401, replay: 401 },
        { label: "expired", token: await identity.issueToken({ groups: ["operator"], expiresAt: Math.floor(Date.now() / 1_000) - 60 }), read: 401, replay: 401 },
        { label: "wrong audience", token: await identity.issueToken({ groups: ["operator"], audience: "other-api" }), read: 401, replay: 401 },
        { label: "wrong issuer", token: await identity.issueToken({ groups: ["operator"], issuer: "https://untrusted.example.com" }), read: 401, replay: 401 },
        { label: "insufficient role", token: await identity.issueToken({ groups: ["viewer"] }), read: 403, replay: 403 },
        { label: "operator", token: operator, read: 200, replay: 403 }
    ];
    for (const entry of cases) {
        await request(`${entry.label} Core read`, `${coreUrl}/api/v1/operator/orders`, entry.read, entry.token);
        await request(`${entry.label} Gateway read`, `${gatewayUrl}/api/v1/operator/deliveries`, entry.read, entry.token);
        await request(`${entry.label} Gateway replay`, `${gatewayUrl}/api/v1/operator/deliveries/${delivery}/replay`, entry.replay, entry.token, { key: randomUUID(), reason });
    }
    check("denied replays preserve state and audit", await gatewaySql(`SELECT status || ':' || attempt_count || ':' || (SELECT count(*) FROM operator_command_audit_entries WHERE target_id='${delivery}') FROM inbound_deliveries WHERE id='${delivery}';`), "EXHAUSTED:1:0");
    await request("admin Core read", `${coreUrl}/api/v1/operator/orders`, 200, admin);
    await request("admin Gateway read", `${gatewayUrl}/api/v1/operator/deliveries`, 200, admin);
    const detailResponse = await request("operator delivery detail", `${gatewayUrl}/api/v1/operator/deliveries/${delivery}`, 200, operator);
    const detail = await detailResponse.json() as Record<string, unknown>;
    check("delivery detail omits raw payload", "rawPayload" in detail, false);
    check("delivery detail omits canonical payload", "canonicalPayload" in detail, false);
    const command = { key: randomUUID(), reason };
    const accepted = await (await request("admin replay accepted", `${gatewayUrl}/api/v1/operator/deliveries/${delivery}/replay`, 202, admin, command)).json() as { commandId: string; outcome: string; idempotent: boolean };
    check("admin replay outcome", accepted.outcome, "REPLAYED");
    check("first replay is a new command", accepted.idempotent, false);
    const repeated = await (await request("admin replay repeated", `${gatewayUrl}/api/v1/operator/deliveries/${delivery}/replay`, 202, admin, command)).json() as { commandId: string; idempotent: boolean };
    check("repeated replay keeps command identity", repeated.commandId, accepted.commandId);
    check("repeated replay is idempotent", repeated.idempotent, true);
    check("replay transition preserves prior attempt", await gatewaySql(`SELECT status || ':' || attempt_count || ':' || (SELECT count(*) FROM delivery_attempts WHERE delivery_id='${delivery}') FROM inbound_deliveries WHERE id='${delivery}';`), "RECEIVED:1:1");
    check("replay journals actor and exact outcome once", await gatewaySql(`SELECT string_agg(event_type,',' ORDER BY event_type) FROM operator_command_audit_entries WHERE target_id='${delivery}' AND actor_subject='${actor}' AND reason='${reason}' AND idempotency_key='${command.key}' AND command_id='${accepted.commandId}';`), "REQUESTED,SUCCEEDED");
    check("repeated replay adds no audit entries", await gatewaySql(`SELECT count(*) FROM operator_command_audit_entries WHERE target_id='${delivery}';`), "2");

    const orderUrl = `${coreUrl}/api/v1/orders/${randomUUID()}`;
    const sourceDenied = await fetch(orderUrl, { headers: { authorization: `Bearer ${admin}` }, signal: AbortSignal.timeout(10_000) });
    check("operator JWT does not replace source key", sourceDenied.status, 401);
    const sourceAccepted = await fetch(orderUrl, { headers: { "x-source-api-key": Buffer.from(source.data.apiKey, "base64").toString() }, signal: AbortSignal.timeout(10_000) });
    check("source credential still reaches source-owned lookup", sourceAccepted.status, 404);
    for (const path of ["/health/ready", "/metrics"]) {
        for (const [service, base] of [["Core", coreUrl], ["Gateway", gatewayUrl]]) {
            const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
            check(`${service} ${path} keeps deployment boundary`, response.status, mesh ? 404 : 200);
        }
    }
    const tokens = [...cases.flatMap(entry => entry.token === undefined ? [] : [entry.token]), admin];
    for (const service of ["integration-core", "connector-gateway"]) {
        const logs = await cluster("kube", ["-n", "hub", "logs", "-l", `app.kubernetes.io/name=${service}`, "--all-containers", `--since-time=${startedAt}`, "--tail=-1"]);
        const leaked = tokens.some(token => [token, ...token.split(".").filter(part => part.length >= 16)].some(part => logs.includes(part)));
        check(`${service} logs omit token material`, leaked, false);
    }
    console.log(`Synthetic replay verified for delivery ${delivery}; its attempt and immutable audit remain in PostgreSQL.`);
}

async function cleanup(): Promise<void> {
    cleaningUp = true;
    stopForwards();
    if (releaseChanged && originalRevision !== undefined) {
        const current = await helmRelease();
        if (current.version !== originalRevision) {
            const values = JSON.parse(await cluster("helm_cmd", ["get", "values", "hub", "-n", "hub", "-o", "json"])) as { operatorSecurity?: { issuer?: string } } | null;
            // Helm may replace the description on a failed upgrade; its unique
            // fixture issuer still identifies the release created by this run.
            if (expectedRevision === undefined || current.version > expectedRevision || (current.info.description !== releaseDescription && values?.operatorSecurity?.issuer !== issuer)) throw new Error("Helm changed concurrently; refusing rollback. Public JWKS fixture retained for inspection.");
            await cluster("helm_cmd", ["rollback", "hub", String(originalRevision), "-n", "hub", "--wait", "--timeout", "5m"]);
            console.log("Original Helm release restored.");
        }
    }
    if (fixtureInstalled) {
        await cluster("kube", ["-n", "hub", "delete", `pod/${name}`, `service/${name}`, `configmap/${name}`, ...(mesh ? [`authorizationpolicy/${name}`] : []), "--ignore-not-found", "--wait=false"]);
    }
}

try {
    try {
        await verify();
    } finally {
        await cleanup();
    }
    // Port-forwards must be recreated because rollout replaces their target pods.
    await connect();
    await demoReads();
    console.log("Protected profile and restored local demo verified.");
} catch (error) {
    console.error(error instanceof Error ? error.message : "Protected-profile verification failed");
    process.exitCode = 1;
} finally {
    stopForwards();
}
