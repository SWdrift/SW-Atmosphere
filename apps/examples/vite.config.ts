import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue"],
      dts: "src/auto-imports.d.ts",
      resolvers: [ElementPlusResolver()]
    }),
    Components({
      dts: "src/components.d.ts",
      resolvers: [ElementPlusResolver()]
    })
  ],
  server: {
    host: true
  }
});
