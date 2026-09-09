import { base44 } from "@/api/base44Client";

export async function getStravaAuthUrl(payload = {}) {
  return base44.functions.invoke("getStravaAuthUrl", payload);
}

export default getStravaAuthUrl;
