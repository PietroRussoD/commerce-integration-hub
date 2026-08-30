# ADR 0013: Classify Integration Core HTTP Outcomes at the Gateway Boundary

- Status: Accepted
- Date: 2026-08-30

## Context

The Connector Gateway must forward canonical orders to the Integration Core
without leaking transport details into delivery orchestration. Retrying every
failure can preserve permanently invalid work forever, while treating every
failure as terminal can lose work during temporary outages.

The HTTP boundary also receives an API key and remote response data, so its
configuration, timeouts, redirects, and exposed errors must be constrained.

## Decision

Define an application port that returns one of four typed outcomes: delivered,
blocked configuration, permanent failure, or retryable failure. Implement the
port with the built-in Node.js `fetch` client and the canonical Integration Core
order contract.

Classify responses as follows:

| Response | Outcome |
| --- | --- |
| `200`, `201` with a valid order ID | Delivered |
| `401`, `403` | Blocked configuration |
| `400`, `404`, `409`, `422` | Permanent failure |
| Timeout, cancellation, network error, `408`, `425`, `429`, `5xx` | Retryable failure |
| Any other status or invalid success body | Retryable failure |

Do not follow redirects. Require a configured HTTP(S) origin without embedded
credentials or path, use a bounded request timeout, validate successful JSON
responses, and never expose remote response bodies or transport error messages
through the application result. Honor delta-seconds and HTTP-date
`Retry-After` values only up to a configured cap.

The adapter classifies one attempt. The delivery worker remains responsible for
recording the attempt and applying fenced completion, retry, or terminal state
transitions.

## Alternatives

- **Return raw `Response` objects to the worker:** rejected because transport
  policy and persistence orchestration would become coupled.
- **Retry every non-success response:** rejected because invalid payloads and
  authentication failures require operator action rather than repeated calls.
- **Use an additional HTTP library:** rejected because Node.js provides the
  required timeout, cancellation, redirect, header, and JSON primitives.
- **Follow redirects automatically:** rejected because an internal API key must
  not be forwarded to an unexpected destination.

## Consequences

The worker can make bounded lifecycle decisions from a stable application
contract, and HTTP implementation details remain replaceable. Unknown outcomes
fail conservatively as retryable and therefore require a later retry limit and
terminal transition to prevent infinite delivery.

The adapter is independently tested but does not forward runtime traffic until
worker orchestration and fenced persistence transitions are connected.
