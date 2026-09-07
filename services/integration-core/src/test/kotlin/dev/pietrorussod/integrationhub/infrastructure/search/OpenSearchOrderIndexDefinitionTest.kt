package dev.pietrorussod.integrationhub.infrastructure.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OpenSearchOrderIndexDefinitionTest {
    @Test
    fun `creates the versioned order index behind the stable read alias`() {
        val request = OpenSearchOrderIndexDefinition.createRequest()
        val settings = requireNotNull(request.settings())
        val mappings = requireNotNull(request.mappings())

        assertEquals(OpenSearchOrderIndexDefinition.INDEX_NAME, request.index())
        assertEquals(1, settings.numberOfShards())
        assertEquals(0, settings.numberOfReplicas())
        assertTrue(request.aliases().containsKey(OpenSearchOrderIndexDefinition.READ_ALIAS))
        assertTrue(request.aliases()[OpenSearchOrderIndexDefinition.READ_ALIAS]?.isWriteIndex() == true)
        assertEquals("strict", requireNotNull(mappings.dynamic()).jsonValue())
    }

    @Test
    fun `uses explicit field mappings for the order search document`() {
        val properties = requireNotNull(OpenSearchOrderIndexDefinition.createRequest().mappings()).properties()

        assertTrue(properties.getValue("orderId").isKeyword)
        assertTrue(properties.getValue("aggregateVersion").isLong)
        assertTrue(properties.getValue("totalAmount").isScaledFloat)
        assertEquals(100.0, properties.getValue("totalAmount").scaledFloat().scalingFactor())
        assertTrue(properties.getValue("receivedAt").isDate)
        assertTrue(properties.getValue("itemSkus").isKeyword)
        assertTrue(properties.getValue("itemDescriptions").isText)
        assertFalse(properties.containsKey("items"))
    }
}
