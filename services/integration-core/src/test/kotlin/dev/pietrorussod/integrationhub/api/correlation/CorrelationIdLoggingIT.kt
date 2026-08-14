package dev.pietrorussod.integrationhub.api.correlation

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.jboss.logmanager.ExtLogRecord
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.logging.Handler
import java.util.logging.LogRecord
import java.util.logging.Logger

@QuarkusTest
class CorrelationIdLoggingIT {
    private val logRecords = CopyOnWriteArrayList<ExtLogRecord>()
    private val logger = Logger.getLogger(CorrelationIdFilter::class.java.name)
    private val handler =
        object : Handler() {
            override fun publish(record: LogRecord) {
                if (record is ExtLogRecord) {
                    record.copyMdc()
                    logRecords.add(record)
                }
            }

            override fun flush() = Unit

            override fun close() = Unit
        }

    @BeforeEach
    fun captureRequestLogs() {
        logger.addHandler(handler)
    }

    @AfterEach
    fun stopCapturingRequestLogs() {
        logger.removeHandler(handler)
        logRecords.clear()
    }

    @Test
    fun `adds request details and the supplied correlation id to the completion log`() {
        given()
            .header(CORRELATION_ID_HEADER, TEST_CORRELATION_ID)
            .`when`()
            .get("/api/service-info")
            .then()
            .statusCode(200)

        val record = completionLog(TEST_CORRELATION_ID)
        assertEquals("GET", record.getMdc("httpMethod"))
        assertEquals("/api/service-info", record.getMdc("httpPath"))
        assertEquals("200", record.getMdc("httpStatus"))
        checkNotNull(record.getMdc("durationMs")).toLong()
    }

    @Test
    fun `does not reuse the correlation id between requests`() {
        given()
            .header(CORRELATION_ID_HEADER, TEST_CORRELATION_ID)
            .`when`()
            .get("/api/service-info")
            .then()
            .statusCode(200)

        val generatedCorrelationId =
            given()
                .`when`()
                .get("/api/service-info")
                .then()
                .statusCode(200)
                .extract()
                .header(CORRELATION_ID_HEADER)

        assertNotEquals(TEST_CORRELATION_ID, generatedCorrelationId)
        completionLog(generatedCorrelationId)
    }

    private fun completionLog(correlationId: String): ExtLogRecord =
        logRecords.single {
            it.message == "HTTP request completed" && it.getMdc(CORRELATION_ID_MDC_KEY) == correlationId
        }

    private companion object {
        const val TEST_CORRELATION_ID = "018f38c2-1b95-7cc4-bb89-72d26a6f9f55"
    }
}
