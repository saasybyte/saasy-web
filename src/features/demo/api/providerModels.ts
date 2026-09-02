import { useQuery } from "@tanstack/solid-query";
import { listProviderModels } from "@/api/edge";
import { providerModelKeys } from "./keys";

export const useProviderModelsQuery = () =>
  useQuery(() => ({
    queryKey: providerModelKeys.all,
    queryFn: async () => {
      const response = await listProviderModels();
      if (response.error) throw response.error;
      return response.data;
    },
  }));
