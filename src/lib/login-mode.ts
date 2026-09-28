/** Login is off by default (single-user personal mode). Set REQUIRE_LOGIN=true to turn it back on. */
export function loginRequired(): boolean {
  return process.env.REQUIRE_LOGIN === "true";
}
