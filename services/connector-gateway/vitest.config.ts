import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
            exclude: [
                "src/main.ts",
                "src/database-migrate.ts",
                "src/**/*.test.ts",
                "src/infrastructure/database/database.ts",
                "src/infrastructure/database/kysely-operational-metrics-source.ts",
                "src/infrastructure/database/kysely-inbound-delivery-attempt-repository.ts",
                "src/infrastructure/database/kysely-inbound-delivery-claim-repository.ts",
                "src/infrastructure/database/kysely-inbound-delivery-inspection-repository.ts",
                "src/infrastructure/database/kysely-inbound-delivery-replay-repository.ts",
                "src/infrastructure/database/kysely-inbound-delivery-repository.ts",
                "src/infrastructure/database/kysely-operator-command-audit-repository.ts",
                "src/infrastructure/database/kysely-polled-order-page-repository.ts",
                "src/infrastructure/database/kysely-polling-lease-repository.ts",
                "src/infrastructure/database/migrations/**/*.ts",
                "src/infrastructure/database/migrator.ts"
            ],
            thresholds: {
                branches: 100,
                functions: 100,
                lines: 100,
                statements: 100
            }
        }
    }
});
