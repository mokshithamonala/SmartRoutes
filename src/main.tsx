import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { AppConvexProvider } from "./lib/convexAdapter";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <AppConvexProvider>
    <App />
  </AppConvexProvider>,
);
