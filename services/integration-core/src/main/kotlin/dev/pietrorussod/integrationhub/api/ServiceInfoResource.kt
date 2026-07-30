package dev.pietrorussod.integrationhub.api

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.config.inject.ConfigProperty

@Path("/api/service-info")
class ServiceInfoResource(
    @param:ConfigProperty(name = "quarkus.application.name")
    private val applicationName: String,
    @param:ConfigProperty(name = "quarkus.application.version")
    private val applicationVersion: String,
) {
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    fun getServiceInfo(): ServiceInfoResponse =
        ServiceInfoResponse(
            name = applicationName,
            status = "UP",
            version = applicationVersion,
        )
}
