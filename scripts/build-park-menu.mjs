import { build } from "vite";

// The park also runs directly from public/demo on a static server and offline.
await build({
  configFile: false,
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  build: {
    outDir: "public/demo/vendor/park-menu",
    lib: { entry: "src/park-menu.tsx", formats: ["iife"], name: "ParkMenu", fileName: () => "menu.js", cssFileName: "menu" },
  },
});
