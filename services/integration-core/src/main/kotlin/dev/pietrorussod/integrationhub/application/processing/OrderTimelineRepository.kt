package dev.pietrorussod.integrationhub.application.processing

interface OrderTimelineRepository {
    fun append(entry: OrderTimelineEntry)
}
