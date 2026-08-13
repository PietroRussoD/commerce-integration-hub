package dev.pietrorussod.integrationhub.api.order

import dev.pietrorussod.integrationhub.api.problem.PROBLEM_JSON
import dev.pietrorussod.integrationhub.api.problem.ProblemDetails
import dev.pietrorussod.integrationhub.api.problem.toResponse
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderOutcome
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderUseCase
import jakarta.validation.Valid
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.responses.APIResponses
import java.net.URI

@Path("/api/v1/orders")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
class OrderResource(
    private val receiveOrderUseCase: ReceiveOrderUseCase,
) {
    @POST
    @Operation(summary = "Receive an order")
    @APIResponses(
        APIResponse(
            responseCode = "201",
            description = "Order created",
            content = [Content(schema = Schema(implementation = OrderResponse::class))],
        ),
        APIResponse(
            responseCode = "200",
            description = "Equivalent order replay",
            content = [Content(schema = Schema(implementation = OrderResponse::class))],
        ),
        APIResponse(
            responseCode = "400",
            description = "Invalid order request",
            content = [Content(mediaType = PROBLEM_JSON, schema = Schema(implementation = ProblemDetails::class))],
        ),
        APIResponse(
            responseCode = "409",
            description = "Source identity already exists with different content",
            content = [Content(mediaType = PROBLEM_JSON, schema = Schema(implementation = ProblemDetails::class))],
        ),
    )
    fun receive(
        @Valid request: ReceiveOrderRequest,
    ): Response {
        val result = receiveOrderUseCase.receive(request.toCommand())
        val location = URI.create("/api/v1/orders/${result.order.id.value}")

        return when (result.outcome) {
            ReceiveOrderOutcome.CREATED -> {
                Response
                    .created(location)
                    .header(IDEMPOTENT_REPLAY_HEADER, false)
                    .entity(result.order.toResponse())
                    .build()
            }

            ReceiveOrderOutcome.ALREADY_RECEIVED -> {
                Response
                    .ok(result.order.toResponse())
                    .location(location)
                    .header(IDEMPOTENT_REPLAY_HEADER, true)
                    .build()
            }

            ReceiveOrderOutcome.PAYLOAD_CONFLICT -> {
                payloadConflict()
            }
        }
    }

    private fun payloadConflict(): Response =
        ProblemDetails(
            type = "urn:problem:order-payload-conflict",
            title = "Order payload conflict",
            status = Response.Status.CONFLICT.statusCode,
            detail = "The source identity already exists with different order content.",
            instance = "/api/v1/orders",
            code = "ORDER_PAYLOAD_CONFLICT",
        ).toResponse()

    private companion object {
        const val IDEMPOTENT_REPLAY_HEADER = "Idempotent-Replay"
    }
}
