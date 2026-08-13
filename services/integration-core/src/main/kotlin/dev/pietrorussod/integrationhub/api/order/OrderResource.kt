package dev.pietrorussod.integrationhub.api.order

import dev.pietrorussod.integrationhub.api.problem.PROBLEM_JSON
import dev.pietrorussod.integrationhub.api.problem.ProblemDetails
import dev.pietrorussod.integrationhub.api.problem.toResponse
import dev.pietrorussod.integrationhub.application.order.GetOrderUseCase
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderOutcome
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderUseCase
import dev.pietrorussod.integrationhub.domain.order.OrderId
import jakarta.validation.Valid
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.responses.APIResponses
import java.net.URI
import java.util.UUID

@Path("/api/v1/orders")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
class OrderResource(
    private val receiveOrderUseCase: ReceiveOrderUseCase,
    private val getOrderUseCase: GetOrderUseCase,
) {
    @POST
    @Operation(operationId = "receiveOrder", summary = "Receive an order")
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

    @GET
    @Path("/{orderId}")
    @Operation(operationId = "getOrder", summary = "Get an order")
    @APIResponses(
        APIResponse(
            responseCode = "200",
            description = "Order found",
            content = [Content(schema = Schema(implementation = OrderResponse::class))],
        ),
        APIResponse(
            responseCode = "400",
            description = "Invalid order ID",
            content = [Content(mediaType = PROBLEM_JSON, schema = Schema(implementation = ProblemDetails::class))],
        ),
        APIResponse(
            responseCode = "404",
            description = "Order not found",
            content = [Content(mediaType = PROBLEM_JSON, schema = Schema(implementation = ProblemDetails::class))],
        ),
    )
    fun get(
        @Parameter(
            description = "Canonical order UUID",
            schema = Schema(type = SchemaType.STRING, format = "uuid"),
        )
        @PathParam("orderId") rawOrderId: String,
    ): Response {
        val orderId = parseOrderId(rawOrderId) ?: return invalidOrderId(rawOrderId)
        val order = getOrderUseCase.get(orderId) ?: return orderNotFound(rawOrderId)

        return Response.ok(order.toResponse()).build()
    }

    private fun parseOrderId(rawOrderId: String): OrderId? =
        runCatching { UUID.fromString(rawOrderId) }
            .getOrNull()
            ?.takeIf { it.toString().equals(rawOrderId, ignoreCase = true) }
            ?.let(::OrderId)

    private fun invalidOrderId(rawOrderId: String): Response =
        ProblemDetails(
            type = "urn:problem:invalid-order-id",
            title = "Invalid order ID",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = "The order ID must be a canonical UUID.",
            instance = "/api/v1/orders/$rawOrderId",
            code = "INVALID_ORDER_ID",
        ).toResponse()

    private fun orderNotFound(rawOrderId: String): Response =
        ProblemDetails(
            type = "urn:problem:order-not-found",
            title = "Order not found",
            status = Response.Status.NOT_FOUND.statusCode,
            detail = "No order exists with the requested ID.",
            instance = "/api/v1/orders/$rawOrderId",
            code = "ORDER_NOT_FOUND",
        ).toResponse()

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
