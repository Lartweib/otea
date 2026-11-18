// A font imported by main.ts: build.mjs has esbuild inline it as a data URL.
declare module '*.woff2' {
  const url: string;
  export default url;
}
