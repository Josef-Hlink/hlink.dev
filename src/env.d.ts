/// <reference types="vite/client" />

/** Latest release tag's commit time (ISO), injected by vite's `define`.
 *  Undefined only outside vite (e.g. compiling a module standalone). */
declare const __RELEASE_TIME__: string | undefined;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
