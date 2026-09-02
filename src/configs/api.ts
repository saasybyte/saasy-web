import { client as edgeClient } from "@/api/edge/client.gen";
import { client as coreClient } from "@/api/core/client.gen";

const EDGE_URL = import.meta.env.VITE_EDGE_URL || "http://localhost:8080";
const CORE_URL = import.meta.env.VITE_CORE_URL || "http://localhost:8082";

edgeClient.setConfig({
  baseUrl: `${EDGE_URL}/api/v1`,
});

coreClient.setConfig({
  baseUrl: `${CORE_URL}/api/v1`,
});
