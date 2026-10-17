export function isTerminalDeliveryStatus(status: string): boolean {
  return ["BLOCKED_CONFIGURATION", "DELIVERED", "EXHAUSTED", "PERMANENT_FAILURE"].includes(status);
}
