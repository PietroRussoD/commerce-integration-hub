import { Navigate, type RouteObject } from "react-router-dom";

import { AppShell } from "./AppShell";
import { RouteLoading } from "./RouteLoading";
import { NotFoundPage } from "../pages/NotFoundPage";
import { defaultBrandTheme, type BrandTheme } from "../theme/brandThemes";

export function createAppRoutes(brandTheme: BrandTheme = defaultBrandTheme): RouteObject[] {
  return [
    {
      element: <AppShell brandTheme={brandTheme} />,
      children: [
        { index: true, element: <Navigate to="/orders" replace /> },
        {
          path: "/orders",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { OrdersPage } = await import("../pages/orders/OrdersPage");
            return { Component: OrdersPage };
          },
        },
        {
          path: "/orders/:orderId",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { OrderDetailPage } = await import("../pages/orders/OrderDetailPage");
            return { Component: OrderDetailPage };
          },
        },
        {
          path: "/deliveries",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { DeliveriesPage } = await import("../pages/deliveries/DeliveriesPage");
            return { Component: DeliveriesPage };
          },
        },
        {
          path: "/deliveries/:deliveryId",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { DeliveryDetailPage } = await import("../pages/deliveries/DeliveryDetailPage");
            return { Component: DeliveryDetailPage };
          },
        },
        {
          path: "/simulator",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { SimulatorPage } = await import("../pages/simulator/SimulatorPage");
            return { Component: SimulatorPage };
          },
        },
        {
          path: "/flow-explorer",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { FlowExplorerPage } = await import("../pages/flow-explorer/FlowExplorerPage");
            return { Component: FlowExplorerPage };
          },
        },
        {
          path: "/system-map",
          hydrateFallbackElement: <RouteLoading />,
          lazy: async () => {
            const { SystemMapPage } = await import("../pages/system-map/SystemMapPage");
            return { Component: SystemMapPage };
          },
        },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ];
}
