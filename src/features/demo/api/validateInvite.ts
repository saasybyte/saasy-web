import { useMutation } from "@tanstack/solid-query";
import { validateInviteCode } from "@/api/core";

export const useValidateInviteMutation = () =>
  useMutation(() => ({
    mutationFn: (code: string) => validateInviteCode({ body: { code } }),
  }));
