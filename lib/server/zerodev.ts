import "server-only";

export function zeroDevRpcUrl(chainId: number): string | null {
  const projectId = process.env.ZERODEV_PROJECT_ID?.trim();
  if (!projectId || !/^[A-Za-z0-9_-]{16,128}$/.test(projectId)) return null;
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}
