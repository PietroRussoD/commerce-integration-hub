package dev.pietrorussod.integrationhub.application.processing

fun interface OrderReadyPayloadSerializer {
    fun serialize(event: OrderReadyEvent): String
}
