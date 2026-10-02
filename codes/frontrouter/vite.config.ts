import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // The API (codes/backrust/server) runs beside it; same paths as production.
  server: { port: 3320, strictPort: true, proxy: { "/api": "http://localhost:3321" } },
  resolve: {
    tsconfigPaths: true,
  },
});
