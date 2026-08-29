import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
            exclude: ["src/main.ts", "src/**/*.test.ts"],
            thresholds: {
                branches: 100,
                functions: 100,
                lines: 100,
                statements: 100
            }
        }
    }
});
