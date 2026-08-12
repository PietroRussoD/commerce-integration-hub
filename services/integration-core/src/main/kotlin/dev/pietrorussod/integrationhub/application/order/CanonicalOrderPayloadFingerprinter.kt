package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.PayloadFingerprint
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.math.BigDecimal
import java.security.MessageDigest
import java.util.HexFormat

class CanonicalOrderPayloadFingerprinter {
    fun fingerprint(order: Order): PayloadFingerprint {
        val canonicalPayload =
            ByteArrayOutputStream().use { byteStream ->
                DataOutputStream(byteStream).use { output ->
                    output.writeShort(CANONICALIZATION_VERSION.toInt())
                    output.writeString(order.currency.name)
                    output.writeDecimal(order.totalAmount.amount)
                    output.writeInt(order.items.size)
                    order.items.forEach { item ->
                        output.writeNullableString(item.externalLineId)
                        output.writeString(item.sku)
                        output.writeNullableString(item.description)
                        output.writeDecimal(item.quantity)
                        output.writeDecimal(item.unitPrice.amount)
                    }
                }
                byteStream.toByteArray()
            }

        val hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonicalPayload))
        return PayloadFingerprint(hash, CANONICALIZATION_VERSION)
    }

    private fun DataOutputStream.writeDecimal(value: BigDecimal) {
        writeString(value.toCanonicalString())
    }

    private fun DataOutputStream.writeNullableString(value: String?) {
        writeBoolean(value != null)
        if (value != null) {
            writeString(value)
        }
    }

    private fun DataOutputStream.writeString(value: String) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        writeInt(bytes.size)
        write(bytes)
    }

    private fun BigDecimal.toCanonicalString(): String =
        if (compareTo(BigDecimal.ZERO) == 0) {
            "0"
        } else {
            stripTrailingZeros().toPlainString()
        }

    private companion object {
        const val CANONICALIZATION_VERSION: Short = 1
    }
}
