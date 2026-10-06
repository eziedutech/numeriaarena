import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // The API (codes/backrust/server) runs beside it; same paths as production.
  // Open on the network too, so a headset on the same Wi-Fi reaches Math Edu from the game's home page.
  server: { host: true, port: 3320, strictPort: true, proxy: { "/api": { target: "http://localhost:3321", ws: true } } },
  resolve: {
    tsconfigPaths: true,
  },
});
