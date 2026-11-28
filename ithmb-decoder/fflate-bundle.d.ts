// Types bridge for the browser-bundled fflate module. The browser cannot
// resolve the bare "fflate" specifier (native ESM has no node_modules
// resolution), so build.mts bundles it once into fflate-bundle.js and
// download.ts imports that. This file forwards fflate's real types so the
// import stays fully typed.
export * from "fflate";
