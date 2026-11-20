import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  optimizeDeps: {
    include: [
      "three",
      "three/examples/jsm/environments/RoomEnvironment.js",
      "three/examples/jsm/controls/OrbitControls.js",
      "@react-three/fiber",
      "leaflet",
      "react-leaflet",
      "recharts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
