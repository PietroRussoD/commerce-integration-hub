package dev.pietrorussod.integrationhub.application.processing

fun interface OrderReceivedProcessor {
    fun process(command: ProcessOrderReceivedCommand): ProcessOrderReceivedResult
}
