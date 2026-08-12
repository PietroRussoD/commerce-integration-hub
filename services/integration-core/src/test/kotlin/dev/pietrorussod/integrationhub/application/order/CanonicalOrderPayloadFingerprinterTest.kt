package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class CanonicalOrderPayloadFingerprinterTest {
    private val fingerprinter = CanonicalOrderPayloadFingerprinter()

    @Test
    fun `creates a stable versioned SHA-256 fingerprint`() {
        val fingerprint = fingerprinter.fingerprint(order())

        assertEquals(1, fingerprint.canonicalizationVersion)
        assertEquals("5f88211f8c377c346a3c9875e2d5efb879e6be2a066db67b5af85cb7f8fdf524", fingerprint.value)
    }

    @Test
    fun `normalizes equivalent decimal representations`() {
        val canonical = order(quantity = "2", unitPrice = "19.99")
        val equivalent = order(quantity = "2.0000", unitPrice = "19.9900")

        assertEquals(fingerprinter.fingerprint(canonical), fingerprinter.fingerprint(equivalent))
    }

    @Test
    fun `excludes server-generated metadata and business identity`() {
        val first = order()
        val second =
            order(
                orderId = "018f38c2-1b95-7cc4-bb89-72d26a6f9f99",
                sourceSystem = "marketplace-b",
                externalOrderId = "order-9999",
                receivedAt = "2026-08-12T12:00:00Z",
            )

        assertEquals(fingerprinter.fingerprint(first), fingerprinter.fingerprint(second))
    }

    @Test
    fun `distinguishes meaningful item changes`() {
        val original = order(description = null)
        val changed = order(description = "First item")

        assertNotEquals(fingerprinter.fingerprint(original), fingerprinter.fingerprint(changed))
    }

    @Test
    fun `distinguishes a missing optional value from an empty value`() {
        val missing = order(description = null)
        val empty = order(description = "")

        assertNotEquals(fingerprinter.fingerprint(missing), fingerprinter.fingerprint(empty))
    }

    @Test
    fun `preserves meaningful item order`() {
        val firstItem = item(position = 0, sku = "SKU-1", externalLineId = "line-1")
        val secondItem = item(position = 1, sku = "SKU-2", externalLineId = "line-2")
        val original = order(items = listOf(firstItem, secondItem))
        val reversed =
            order(
                items =
                    listOf(
                        item(position = 0, sku = "SKU-2", externalLineId = "line-2"),
                        item(position = 1, sku = "SKU-1", externalLineId = "line-1"),
                    ),
            )

        assertNotEquals(fingerprinter.fingerprint(original), fingerprinter.fingerprint(reversed))
    }

    private fun order(
        orderId: String = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52",
        sourceSystem: String = "marketplace-a",
        externalOrderId: String = "order-1001",
        quantity: String = "2",
        unitPrice: String = "19.99",
        description: String? = null,
        receivedAt: String = "2026-08-02T06:30:00Z",
        items: List<OrderItem>? = null,
    ): Order {
        val orderItems =
            items ?: listOf(item(0, "SKU-BOOK-1", "line-1", quantity, unitPrice, description))
        val total = orderItems.fold(BigDecimal.ZERO) { amount, item -> amount.add(item.lineAmount.amount) }
        return Order.receive(
            id = OrderId(UUID.fromString(orderId)),
            sourceSystem = SourceSystem.from(sourceSystem),
            externalOrderId = ExternalOrderId.from(externalOrderId),
            currency = Currency.EUR,
            items = orderItems,
            declaredTotalAmount = Money.of(total, Currency.EUR),
            receivedAt = Instant.parse(receivedAt),
        )
    }

    private fun item(
        position: Int,
        sku: String,
        externalLineId: String,
        quantity: String = "1",
        unitPrice: String = "10.00",
        description: String? = null,
    ): OrderItem =
        OrderItem.create(
            id = UUID.nameUUIDFromBytes("$externalLineId-$position".toByteArray()),
            externalLineId = externalLineId,
            sku = sku,
            description = description,
            quantity = BigDecimal(quantity),
            unitPrice = Money.of(BigDecimal(unitPrice), Currency.EUR),
            position = position,
        )
}
