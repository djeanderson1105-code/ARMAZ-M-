/**
 * Resolves the dynamic absolute or relative API URL.
 * Redirects requests to the active Cloud Run instance if the current frontend is deployed externally (e.g. GitHub Pages or APK).
 */
export function getApiUrl(path: string): string {
  const origin = window.location.origin;
  
  // If we are on localhost, development server or shared preview instance, use a standard relative path
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("3000") ||
    origin.includes("ais-dev") ||
    origin.includes("ais-pre")
  ) {
    return path;
  }
  
  // For GitHub Pages, custom hostnames, or native Android client APK, route directly to the serverless Cloud Run instance
  const productionBaseUrl = "https://ais-pre-zm53rfl4iol6u6dn4r6ymj-565626140350.us-west2.run.app";
  return `${productionBaseUrl}${path}`;
}
