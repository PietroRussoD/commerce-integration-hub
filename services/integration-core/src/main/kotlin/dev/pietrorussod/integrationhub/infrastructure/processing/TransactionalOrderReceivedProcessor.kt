package dev.pietrorussod.integrationhub.infrastructure.processing

import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedCommand
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedResult
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedUseCase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import jakarta.transaction.Transactional

@ApplicationScoped
class TransactionalOrderReceivedProcessor
    @Inject
    constructor(
        private val delegate: ProcessOrderReceivedUseCase,
    ) {
        @Transactional
        fun process(command: ProcessOrderReceivedCommand): ProcessOrderReceivedResult = delegate.process(command)
    }
