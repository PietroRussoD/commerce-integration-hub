package dev.pietrorussod.integrationhub.api.operator

import dev.pietrorussod.integrationhub.api.problem.PROBLEM_JSON
import dev.pietrorussod.integrationhub.api.problem.ProblemDetails
import dev.pietrorussod.integrationhub.api.problem.ProblemFieldError
import dev.pietrorussod.integrationhub.api.problem.toResponse
import dev.pietrorussod.integrationhub.application.operator.GetOperatorOrderUseCase
import dev.pietrorussod.integrationhub.application.operator.ListOperatorOrdersQuery
import dev.pietrorussod.integrationhub.application.operator.ListOperatorOrdersUseCase
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.responses.APIResponses
import java.util.UUID

@Path("/api/v1/operator/orders")
@Produces(MediaType.APPLICATION_JSON)
class OperatorOrderResource(
    private val listOperatorOrdersUseCase: ListOperatorOrdersUseCase,
    private val getOperatorOrderUseCase: GetOperatorOrderUseCase,
) {
    @GET
    @Operation(operationId = "listOperatorOrders", summary = "List orders for operator inspection")
    @APIResponses(
        APIResponse(
            responseCode = "200",
            description = "Orders listed",
            content = [Content(schema = Schema(implementation = OperatorOrderListResponse::class))],
        ),
        APIResponse(
            responseCode = "400",
            description = "Invalid operator order query",
            content = [Content(mediaType = PROBLEM_JSON, schema = Schema(implementation = ProblemDetails::class))],
        ),
    )
    fun list(
        @Parameter(description = "Optional order status filter")
        @QueryParam("status") rawStatus: String?,
        @Parameter(description = "Maximum number of items to return", schema = Schema(type = SchemaType.INTEGER))
        @DefaultValue(DEFAULT_LIMIT)
        @QueryParam("limit") limit: Int,
        @Parameter(description = "Number of items to skip", schema = Schema(type = SchemaType.INTEGER))
        @DefaultValue(DEFAULT_OFFSET)
        @QueryParam("offset") offset: Int,
    ): Response {
        val status = rawStatus?.let { parseStatus(it) ?: return invalidStatus(it) }
        if (limit !in 1..MAX_LIMIT) {
            return invalidPageParameter("limit", "The limit must be between 1 and $MAX_LIMIT.")
        }
        if (offset < 0) {
            return invalidPageParameter("offset", "The offset must be greater than or equal to 0.")
        }

        val page =
            listOperatorOrdersUseCase.list(
                ListOperatorOrdersQuery(
                    status = status,
                    limit = limit,
                    offset = offset,
                ),
            )

        return Response.ok(page.toResponse()).build()
    }

    @GET
    @Path("/{orderId}")
    @Operation(operationId = "getOperatorOrder", summary = "Get an order for operator inspection")
    @APIResponses(
        APIResponse(
            responseCode = "200",
            description = "Order found",
            content = [Content(schema = Schema(implementation = OperatorOrderDetailResponse::class))],
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
        val order = getOperatorOrderUseCase.get(orderId) ?: return orderNotFound(rawOrderId)

        return Response.ok(order.toResponse()).build()
    }

    private fun parseStatus(rawStatus: String): OrderStatus? = runCatching { OrderStatus.valueOf(rawStatus.uppercase()) }.getOrNull()

    private fun parseOrderId(rawOrderId: String): OrderId? =
        runCatching { UUID.fromString(rawOrderId) }
            .getOrNull()
            ?.takeIf { it.toString().equals(rawOrderId, ignoreCase = true) }
            ?.let(::OrderId)

    private fun invalidStatus(rawStatus: String): Response =
        ProblemDetails(
            type = "urn:problem:invalid-operator-order-query",
            title = "Invalid operator order query",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = "Unsupported order status: $rawStatus.",
            instance = "/api/v1/operator/orders",
            code = "INVALID_OPERATOR_ORDER_QUERY",
        ).toResponse()

    private fun invalidPageParameter(
        parameter: String,
        detail: String,
    ): Response =
        ProblemDetails(
            type = "urn:problem:invalid-operator-order-query",
            title = "Invalid operator order query",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = detail,
            instance = "/api/v1/operator/orders",
            code = "INVALID_OPERATOR_ORDER_QUERY",
            errors = listOf(ProblemFieldError(field = parameter, message = detail)),
        ).toResponse()

    private fun invalidOrderId(rawOrderId: String): Response =
        ProblemDetails(
            type = "urn:problem:invalid-order-id",
            title = "Invalid order ID",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = "The order ID must be a canonical UUID.",
            instance = "/api/v1/operator/orders/$rawOrderId",
            code = "INVALID_ORDER_ID",
        ).toResponse()

    private fun orderNotFound(rawOrderId: String): Response =
        ProblemDetails(
            type = "urn:problem:order-not-found",
            title = "Order not found",
            status = Response.Status.NOT_FOUND.statusCode,
            detail = "No order exists with the requested ID.",
            instance = "/api/v1/operator/orders/$rawOrderId",
            code = "ORDER_NOT_FOUND",
        ).toResponse()

    private companion object {
        const val DEFAULT_LIMIT = "25"
        const val DEFAULT_OFFSET = "0"
        const val MAX_LIMIT = 100
    }
}
