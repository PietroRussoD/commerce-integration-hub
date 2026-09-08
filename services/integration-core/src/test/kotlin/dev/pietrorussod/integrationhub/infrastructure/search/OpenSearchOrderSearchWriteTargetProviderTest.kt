package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexPhase
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexState
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OpenSearchOrderSearchWriteTargetProviderTest {
    @Test
    fun `writes only through the stable alias while no reindex is active`() {
        assertEquals(
            listOf(OpenSearchOrderSearchWriteTarget.activeReadAlias()),
            OpenSearchOrderSearchWriteTargetProvider.buildTargets(state(OrderSearchReindexPhase.IDLE)),
        )
    }

    @Test
    fun `writes to the stable alias and candidate while a reindex is active`() {
        assertEquals(
            listOf(
                OpenSearchOrderSearchWriteTarget.activeReadAlias(),
                OpenSearchOrderSearchWriteTarget.candidateIndex("orders-v2"),
            ),
            OpenSearchOrderSearchWriteTargetProvider.buildTargets(state(OrderSearchReindexPhase.REBUILDING)),
        )
    }

    @Test
    fun `writes only through the stable alias while the candidate is being prepared`() {
        assertEquals(
            listOf(OpenSearchOrderSearchWriteTarget.activeReadAlias()),
            OpenSearchOrderSearchWriteTargetProvider.buildTargets(state(OrderSearchReindexPhase.PREPARING)),
        )
    }

    @Test
    fun `treats a dual write as applied when either target advances`() {
        assertEquals(
            OrderSearchProjectionWriteOutcome.APPLIED,
            OpenSearchOrderSearchProjection.combineOutcomes(
                OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION,
                OrderSearchProjectionWriteOutcome.APPLIED,
            ),
        )
    }

    private fun state(phase: OrderSearchReindexPhase): OrderSearchReindexState =
        OrderSearchReindexState(
            version = 1,
            phase = phase,
            sourceIndex = if (phase == OrderSearchReindexPhase.IDLE) null else "orders-v1",
            candidateIndex = if (phase == OrderSearchReindexPhase.IDLE) null else "orders-v2",
            cursor = null,
            progress = OrderSearchReindexProgress(0, 0, 0),
            lease = null,
        )
}
