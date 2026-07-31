// Ambient declarations for optional vendor packages that MCUE loads on demand.
// These are NOT installed by default (they are only needed on serverless /
// specialized deployments) so the compiler must not require their types.

declare module "@sparticuz/chromium" {
  const chromium: {
    executablePath(): Promise<string>;
    args: string[];
  } & Record<string, unknown>;
  export default chromium;
}
