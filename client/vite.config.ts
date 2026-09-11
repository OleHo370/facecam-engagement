import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Proxy Socket.IO traffic to the Express backend during Vite development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
});
