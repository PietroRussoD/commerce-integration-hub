package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.util.UUID

class OrderItemTest {
    private val itemId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54")

    @Test
    fun `creates an order item and calculates its rounded line amount`() {
        val item =
            orderItem(
                quantity = "1",
                unitPrice = "10.005",
            )

        assertEquals(itemId, item.id)
        assertEquals("line-1", item.externalLineId)
        assertEquals("SKU-BOOK-1", item.sku)
        assertEquals("First item", item.description)
        assertEquals(BigDecimal("1"), item.quantity)
        assertEquals(Money.of(BigDecimal("10.005"), Currency.EUR), item.unitPrice)
        assertEquals(Money.of(BigDecimal("10.01"), Currency.EUR), item.lineAmount)
        assertEquals(0, item.position)
    }

    @Test
    fun `rounds the line amount down below the midpoint`() {
        val item =
            orderItem(
                quantity = "1",
                unitPrice = "10.004",
            )

        assertEquals(Money.of(BigDecimal("10.00"), Currency.EUR), item.lineAmount)
    }

    @Test
    fun `normalizes insignificant quantity zeros`() {
        val item = orderItem(quantity = "2.0000")

        assertEquals(BigDecimal("2"), item.quantity)
    }

    @Test
    fun `rejects a non-positive quantity`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(quantity = "0")
        }
    }

    @Test
    fun `rejects a negative unit price`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(unitPrice = "-0.0001")
        }
    }

    @Test
    fun `rejects quantities with more than four fractional digits`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(quantity = "1.00001")
        }
    }

    @Test
    fun `rejects values that do not fit the persistence integer digits`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(unitPrice = "1000000000000000")
        }
    }

    @Test
    fun `rejects a calculated line amount that does not fit persistence`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(
                quantity = "999999999999999",
                unitPrice = "1000",
            )
        }
    }

    @Test
    fun `rejects a SKU with surrounding whitespace`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(sku = " SKU-BOOK-1 ")
        }
    }

    @Test
    fun `rejects a negative position`() {
        assertThrows(IllegalArgumentException::class.java) {
            orderItem(position = -1)
        }
    }

    private fun orderItem(
        sku: String = "SKU-BOOK-1",
        quantity: String = "2",
        unitPrice: String = "19.99",
        position: Int = 0,
    ): OrderItem =
        OrderItem.create(
            id = itemId,
            externalLineId = "line-1",
            sku = sku,
            description = "First item",
            quantity = BigDecimal(quantity),
            unitPrice = Money.of(BigDecimal(unitPrice), Currency.EUR),
            position = position,
        )
}
