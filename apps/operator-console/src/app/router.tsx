import { Navigate, type RouteObject } from "react-router-dom";

import { AppShell } from "./AppShell";
import { RouteLoading } from "./RouteLoading";
import { DeliveriesPage } from "../pages/deliveries/DeliveriesPage";
import { DeliveryDetailPage } from "../pages/deliveries/DeliveryDetailPage";
import { OrderDetailPage } from "../pages/orders/OrderDetailPage";
import { OrdersPage } from "../pages/orders/OrdersPage";
import { SimulatorPage } from "../pages/simulator/SimulatorPage";
import { defaultBrandTheme, type BrandTheme } from "../theme/brandThemes";

export function createAppRoutes(brandTheme: BrandTheme = defaultBrandTheme): RouteObject[] {
  return [
    {
      element: <AppShell brandTheme={brandTheme} />,
      children: [
        { index: true, element: <Navigate to="/orders" replace /> },
        { path: "/orders", element: <OrdersPage /> },
        { path: "/orders/:orderId", element: <OrderDetailPage /> },
        { path: "/deliveries", element: <DeliveriesPage /> },
        { path: "/deliveries/:deliveryId", element: <DeliveryDetailPage /> },
        { path: "/simulator", element: <SimulatorPage /> },
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
      ],
    },
  ];
}
