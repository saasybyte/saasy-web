type ApiSpec = {
  name: string;
  baseUrl: string;
  specPath: string;
  outputDir: string;
};

const SPECS: ApiSpec[] = [
  {
    name: "edge",
    baseUrl: process.env.VITE_EDGE_URL || "http://localhost:8080",
    specPath: "./openapi/saasy-edge-api.yaml",
    outputDir: "./src/api/edge",
  },
  {
    name: "core",
    baseUrl: process.env.VITE_CORE_URL || "http://localhost:8082",
    specPath: "./openapi/saasy-core-api.yaml",
    outputDir: "./src/api/core",
  },
];

async function generateApi(spec: ApiSpec) {
  const specUrl = `${spec.baseUrl}/api/v1/openapi`;
  console.log(`\n[${spec.name}] Fetching OpenAPI spec from ${specUrl}`);

  const response = await fetch(specUrl);
  if (!response.ok) {
    throw new Error(
      `[${spec.name}] Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
    );
  }

  const specContent = await response.text();
  await Bun.write(spec.specPath, specContent);
  console.log(`[${spec.name}] Saved OpenAPI spec to ${spec.specPath}`);

  console.log(`[${spec.name}] Generating TypeScript fetch-client...`);
  await Bun.$`npx @hey-api/openapi-ts -i ${spec.specPath} -o ${spec.outputDir} -c @hey-api/client-fetch`;

  console.log(`[${spec.name}] Done!`);
}

async function main() {
  const filter = process.argv[2]; // e.g., "edge", "core", or undefined for all

  const specsToGenerate = filter ? SPECS.filter((s) => s.name === filter) : SPECS;

  if (specsToGenerate.length === 0) {
    console.error(`Unknown spec: ${filter}. Available: ${SPECS.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  for (const spec of specsToGenerate) {
    await generateApi(spec);
  }

  console.log("\nAll done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
