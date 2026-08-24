import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";

import { AppShell } from "./AppShell";
import { OrdersPage } from "../pages/orders/OrdersPage";
import { SimulatorPage } from "../pages/simulator/SimulatorPage";

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/orders" replace /> },
      { path: "/orders", element: <OrdersPage /> },
      { path: "/simulator", element: <SimulatorPage /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
