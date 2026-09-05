package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

class JooqCodeGenerationTest {
    @Test
    fun `generates order table metadata from Flyway migrations`() {
        assertEquals("orders", ORDERS.name)
        assertEquals(UUID::class.java, ORDERS.ID.dataType.type)
        assertEquals(String::class.java, ORDERS.CURRENCY.dataType.type)
        assertFalse(ORDERS.CURRENCY.dataType.nullable())
        assertEquals(BigDecimal::class.java, ORDERS.TOTAL_AMOUNT.dataType.type)
        assertFalse(ORDERS.TOTAL_AMOUNT.dataType.nullable())
        assertEquals(String::class.java, ORDERS.PAYLOAD_FINGERPRINT.dataType.type)
        assertFalse(ORDERS.PAYLOAD_FINGERPRINT.dataType.nullable())
        assertEquals(Short::class.javaObjectType, ORDERS.PAYLOAD_FINGERPRINT_VERSION.dataType.type)
        assertFalse(ORDERS.PAYLOAD_FINGERPRINT_VERSION.dataType.nullable())
        assertEquals(Long::class.javaObjectType, ORDERS.AGGREGATE_VERSION.dataType.type)
        assertFalse(ORDERS.AGGREGATE_VERSION.dataType.nullable())
        assertEquals(OffsetDateTime::class.java, ORDERS.RECEIVED_AT.dataType.type)
        assertFalse(ORDERS.ID.dataType.nullable())
        assertEquals("pk_orders", ORDERS.primaryKey.name)
        assertEquals(listOf("uk_orders_source_identity"), ORDERS.uniqueKeys.map { it.name })
        assertEquals(
            setOf(
                "ck_orders_aggregate_version_positive",
                "ck_orders_currency",
                "ck_orders_payload_fingerprint_format",
                "ck_orders_payload_fingerprint_version",
                "ck_orders_status",
                "ck_orders_total_amount_non_negative",
            ),
            ORDERS.checks.map { it.name }.toSet(),
        )
    }
}
