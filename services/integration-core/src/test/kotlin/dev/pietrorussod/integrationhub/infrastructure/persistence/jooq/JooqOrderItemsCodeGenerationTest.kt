package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.util.UUID

class JooqOrderItemsCodeGenerationTest {
    @Test
    fun `generates order items metadata from Flyway migrations`() {
        assertEquals("order_items", ORDER_ITEMS.name)
        assertEquals(UUID::class.java, ORDER_ITEMS.ID.dataType.type)
        assertEquals(UUID::class.java, ORDER_ITEMS.ORDER_ID.dataType.type)
        assertEquals(BigDecimal::class.java, ORDER_ITEMS.QUANTITY.dataType.type)
        assertEquals(BigDecimal::class.java, ORDER_ITEMS.UNIT_PRICE.dataType.type)
        assertEquals(BigDecimal::class.java, ORDER_ITEMS.LINE_AMOUNT.dataType.type)
        assertFalse(ORDER_ITEMS.ID.dataType.nullable())
        assertTrue(ORDER_ITEMS.EXTERNAL_LINE_ID.dataType.nullable())
        assertEquals("pk_order_items", ORDER_ITEMS.primaryKey.name)
        assertEquals(
            setOf("uk_order_items_order_external_line", "uk_order_items_order_position"),
            ORDER_ITEMS.uniqueKeys.map { it.name }.toSet(),
        )
        assertEquals(
            setOf(
                "ck_order_items_line_amount_non_negative",
                "ck_order_items_position_non_negative",
                "ck_order_items_quantity_positive",
                "ck_order_items_unit_price_non_negative",
            ),
            ORDER_ITEMS.checks.map { it.name }.toSet(),
        )
        assertEquals(listOf("fk_order_items_order"), ORDER_ITEMS.references.map { it.name })
    }
}
