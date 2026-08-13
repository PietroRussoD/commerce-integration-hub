package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.order.CanonicalOrderPayloadFingerprinter
import dev.pietrorussod.integrationhub.application.order.GetOrderUseCase
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderUseCase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock
import java.util.UUID

class OrderApplicationConfiguration {
    @Produces
    @ApplicationScoped
    fun getOrderUseCase(orderRepository: OrderRepository): GetOrderUseCase = GetOrderUseCase(orderRepository)

    @Produces
    @ApplicationScoped
    fun receiveOrderUseCase(orderRepository: OrderRepository): ReceiveOrderUseCase =
        ReceiveOrderUseCase(
            orderRepository = orderRepository,
            payloadFingerprinter = CanonicalOrderPayloadFingerprinter(),
            clock = Clock.systemUTC(),
            generateOrderId = UUID::randomUUID,
            generateOrderItemId = UUID::randomUUID,
        )
}
