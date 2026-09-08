package dev.pietrorussod.integrationhub.api.operator

import dev.pietrorussod.integrationhub.api.problem.PROBLEM_JSON
import dev.pietrorussod.integrationhub.api.problem.ProblemDetails
import dev.pietrorussod.integrationhub.api.problem.ProblemFieldError
import dev.pietrorussod.integrationhub.api.problem.toResponse
import dev.pietrorussod.integrationhub.application.search.SearchOrdersQuery
import dev.pietrorussod.integrationhub.application.search.SearchOrdersUseCase
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
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
import java.time.Instant

@Path("/api/v1/operator/orders/search")
@Produces(MediaType.APPLICATION_JSON)
class OperatorOrderSearchResource(
    private val searchOrdersUseCase: SearchOrdersUseCase,
) {
    @GET
    @Operation(operationId = "searchOperatorOrders", summary = "Search projected orders for operator inspection")
    @APIResponses(
        APIResponse(
            responseCode = "200",
            description = "Projected orders searched",
            content = [Content(schema = Schema(implementation = OperatorOrderSearchResponse::class))],
        ),
        APIResponse(
            responseCode = "400",
            description = "Invalid operator order search query",
            content = [Content(mediaType = PROBLEM_JSON, schema = Schema(implementation = ProblemDetails::class))],
        ),
    )
    fun search(
        @Parameter(description = "Free text matched against item descriptions")
        @QueryParam("q") text: String?,
        @Parameter(description = "Exact source system")
        @QueryParam("sourceSystem") rawSourceSystem: String?,
        @Parameter(description = "Exact external order ID")
        @QueryParam("externalOrderId") rawExternalOrderId: String?,
        @Parameter(description = "Exact order status")
        @QueryParam("status") rawStatus: String?,
        @Parameter(description = "Exact ISO 4217 currency code")
        @QueryParam("currency") rawCurrency: String?,
        @Parameter(description = "Exact item SKU")
        @QueryParam("sku") sku: String?,
        @Parameter(description = "Inclusive ISO-8601 receipt timestamp")
        @QueryParam("receivedAtFrom") rawReceivedAtFrom: String?,
        @Parameter(description = "Exclusive ISO-8601 receipt timestamp")
        @QueryParam("receivedAtBefore") rawReceivedAtBefore: String?,
        @Parameter(description = "Maximum number of items to return", schema = Schema(type = SchemaType.INTEGER))
        @DefaultValue(DEFAULT_LIMIT)
        @QueryParam("limit") limit: Int,
        @Parameter(description = "Number of items to skip", schema = Schema(type = SchemaType.INTEGER))
        @DefaultValue(DEFAULT_OFFSET)
        @QueryParam("offset") offset: Int,
    ): Response {
        val sourceSystem =
            rawSourceSystem?.let { value ->
                runCatching { SourceSystem.from(value) }.getOrElse { return invalid("sourceSystem") }
            }
        val externalOrderId =
            rawExternalOrderId?.let { value ->
                runCatching { ExternalOrderId.from(value) }.getOrElse { return invalid("externalOrderId") }
            }
        val status =
            rawStatus?.let { value ->
                runCatching { OrderStatus.valueOf(value.uppercase()) }.getOrElse { return invalid("status") }
            }
        val currency =
            rawCurrency?.let { value ->
                runCatching { Currency.from(value.uppercase()) }.getOrElse { return invalid("currency") }
            }
        val receivedAtFrom =
            rawReceivedAtFrom?.let { value ->
                runCatching { Instant.parse(value) }.getOrElse { return invalid("receivedAtFrom") }
            }
        val receivedAtBefore =
            rawReceivedAtBefore?.let { value ->
                runCatching { Instant.parse(value) }.getOrElse { return invalid("receivedAtBefore") }
            }

        val query =
            runCatching {
                SearchOrdersQuery(
                    text = text,
                    sourceSystem = sourceSystem,
                    externalOrderId = externalOrderId,
                    status = status,
                    currency = currency,
                    sku = sku,
                    receivedAtFrom = receivedAtFrom,
                    receivedAtBefore = receivedAtBefore,
                    limit = limit,
                    offset = offset,
                )
            }.getOrElse { exception ->
                return invalid(queryParameterFor(exception.message), exception.message)
            }

        return Response.ok(searchOrdersUseCase.search(query).toResponse()).build()
    }

    private fun invalid(
        parameter: String,
        detail: String? = null,
    ): Response =
        ProblemDetails(
            type = "urn:problem:invalid-operator-order-search-query",
            title = "Invalid operator order search query",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = detail ?: "Invalid value for $parameter.",
            instance = "/api/v1/operator/orders/search",
            code = "INVALID_OPERATOR_ORDER_SEARCH_QUERY",
            errors = listOf(ProblemFieldError(field = parameter, message = detail ?: "Invalid value.")),
        ).toResponse()

    private fun queryParameterFor(message: String?): String =
        when {
            message?.contains("receipt") == true -> "receivedAtFrom"
            message?.contains("page size") == true -> "limit"
            message?.contains("offset") == true -> "offset"
            message?.contains("SKU") == true -> "sku"
            else -> "q"
        }

    private companion object {
        const val DEFAULT_LIMIT = "25"
        const val DEFAULT_OFFSET = "0"
    }
}
