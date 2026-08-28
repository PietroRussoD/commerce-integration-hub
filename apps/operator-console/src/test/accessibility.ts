import axe, { type Result } from "axe-core";

export async function expectNoAccessibilityViolations(container: Element): Promise<void> {
  const { violations } = await axe.run(container, {
    rules: {
      // jsdom has no layout engine, so contrast requires a separate browser-based check.
      "color-contrast": { enabled: false },
    },
  });

  if (violations.length > 0) {
    throw new Error(formatViolations(violations));
  }
}

function formatViolations(violations: Result[]): string {
  return violations
    .map(
      (violation) =>
        `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary ?? "No failure summary"}`)
          .join("\n")}`,
    )
    .join("\n\n");
}
