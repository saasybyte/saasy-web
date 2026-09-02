import { Select } from "@kobalte/core/select";
import { TextField } from "@kobalte/core/text-field";
import { Button } from "@kobalte/core/button";
import { ChevronDown } from "lucide-solid";
import { createEffect, createMemo, Show } from "solid-js";
import {
  pageState,
  inviteCode,
  setInviteCode,
  validationError,
  selectedLlm,
  setSelectedLlm,
  selectedStt,
  setSelectedStt,
  selectedTts,
  setSelectedTts,
  isConnecting,
  sessionError,
  onValidationSuccess,
  onValidationError,
  clearValidationError,
  startSession,
} from "../stores/state";
import { useProviderModelsQuery } from "../api/providerModels";
import { useValidateInviteMutation } from "../api/validateInvite";

type SelectOption = { value: string; label: string };

function ProviderSelect(props: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={props.options.find((o) => o.value === props.value)}
      onChange={(option) => option && props.onChange(option.value)}
      options={props.options}
      optionValue="value"
      optionTextValue="label"
      placeholder={props.label}
      disabled={props.disabled}
      class="w-full md:w-auto"
      itemComponent={(itemProps) => (
        <Select.Item
          item={itemProps.item}
          class="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none data-highlighted:bg-zinc-700 data-highlighted:text-white"
        >
          <Select.ItemLabel>{itemProps.item.rawValue.label}</Select.ItemLabel>
        </Select.Item>
      )}
    >
      <Select.Trigger
        class="flex w-full min-w-35 items-center justify-between gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-base outline-none transition-colors hover:border-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-zinc-700 md:w-auto md:text-sm"
        classList={{ "text-zinc-500": props.disabled, "text-zinc-300": !props.disabled }}
      >
        <Select.Value<SelectOption>>{(state) => state.selectedOption().label}</Select.Value>
        <Select.Icon>
          <ChevronDown class="h-4 w-4 text-zinc-500" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="z-50 rounded-xl border border-zinc-700 bg-zinc-800 p-1 shadow-xl">
          <Select.Listbox class="outline-none" />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

export default function AssistantControls() {
  const providerModelsQuery = useProviderModelsQuery();
  const validateMutation = useValidateInviteMutation();

  const handleSubmitInviteCode = () => {
    const code = inviteCode().trim();
    if (!code) return;

    clearValidationError();
    validateMutation.mutate(code, {
      onSuccess: (response) => {
        if (response.error || response.data?.error) {
          onValidationError(response.data?.error || "Validation failed");
          return;
        }
        if (response.data?.token) {
          onValidationSuccess(response.data.token);
        } else {
          onValidationError("No token received");
        }
      },
      onError: (err) => {
        onValidationError(err instanceof Error ? err.message : "An error occurred");
      },
    });
  };

  const llmOptions = createMemo(
    () =>
      providerModelsQuery.data?.llm
        ?.map((m) => ({ value: m.id, label: m.displayName }))
        .sort(
          (a, b) =>
            (a.label[1] ?? "").localeCompare(b.label[1] ?? "") || a.label.localeCompare(b.label),
        ) ?? [],
  );
  const sttOptions = createMemo(
    () =>
      providerModelsQuery.data?.stt
        ?.map((m) => ({ value: m.id, label: m.displayName }))
        .sort((a, b) => a.label.localeCompare(b.label)) ?? [],
  );
  const ttsOptions = createMemo(
    () =>
      providerModelsQuery.data?.tts
        ?.map((m) => ({ value: m.id, label: m.displayName }))
        .sort((a, b) => a.label.localeCompare(b.label)) ?? [],
  );

  // Auto-select first option when data loads (respects sorted order)
  createEffect(() => {
    if (providerModelsQuery.data) {
      if (!selectedLlm() && llmOptions()[0]) setSelectedLlm(llmOptions()[0].value);
      if (!selectedStt() && sttOptions()[0]) setSelectedStt(sttOptions()[0].value);
      if (!selectedTts() && ttsOptions()[0]) {
        const ttsData = providerModelsQuery.data.tts ?? [];
        const candidates = [
          ttsData.find((m) => m.provider === "cartesia" && m.modelId === "sonic-3"),
          ttsData.find((m) => m.provider === "elevenlabs" && m.modelId === "eleven_turbo_v2_5"),
        ].filter(Boolean);
        const pick =
          candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : undefined;
        setSelectedTts(pick?.id ?? ttsOptions()[0].value);
      }
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmitInviteCode();
    }
  };

  const handleStartSession = () => {
    const data = providerModelsQuery.data;
    if (!data) return;

    const llm = data.llm?.find((m) => m.id === selectedLlm());
    const tts = data.tts?.find((m) => m.id === selectedTts());
    const stt = data.stt?.find((m) => m.id === selectedStt());

    if (!llm || !tts || !stt) return;

    startSession({
      llm: { provider: llm.provider, modelId: llm.modelId },
      tts: { provider: tts.provider, modelId: tts.modelId },
      stt: { provider: stt.provider, modelId: stt.modelId },
    });
  };

  return (
    <div class="flex flex-col items-center gap-6 py-8">
      {/* Line 1: Invite Code Input OR Start Session Button */}
      <Show
        when={pageState() === "locked"}
        fallback={
          <div class="flex flex-col items-center gap-2">
            <Button
              onClick={handleStartSession}
              disabled={isConnecting()}
              class="cursor-pointer rounded-xl bg-white px-8 py-3 text-sm font-medium text-black transition-all hover:bg-zinc-300 hover:scale-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConnecting() ? "Connecting..." : "Ask Anysia"}
            </Button>
            <Show when={sessionError()}>
              <p class="text-sm text-red-400">{sessionError()}</p>
            </Show>
          </div>
        }
      >
        <div class="flex flex-col items-center gap-2">
          <div class="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <TextField
              value={inviteCode()}
              onChange={setInviteCode}
              class="flex w-full items-center sm:w-auto"
            >
              <TextField.Input
                placeholder="Enter invite code to start"
                onKeyDown={handleKeyDown}
                disabled={validateMutation.isPending}
                autocomplete="off"
                class="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-base text-white placeholder-zinc-500 outline-none transition-colors focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-64 md:text-sm"
              />
            </TextField>
            <Button
              onClick={handleSubmitInviteCode}
              disabled={inviteCode().trim().length === 0 || validateMutation.isPending}
              class="cursor-pointer rounded-xl bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:bg-zinc-300 hover:scale-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {validateMutation.isPending ? "Validating..." : "Submit"}
            </Button>
          </div>
          <Show when={validationError()}>
            <p class="text-sm text-red-400">{validationError()}</p>
          </Show>
          <p class="text-xs text-zinc-500">For best experience, use a desktop or laptop browser.</p>
        </div>
      </Show>

      {/* Line 2: Provider Dropdowns */}
      <div class="flex w-full flex-col items-center gap-3 md:flex-row md:justify-center md:gap-4">
        <ProviderSelect
          label="LLM"
          options={llmOptions()}
          value={selectedLlm()}
          onChange={setSelectedLlm}
          disabled={providerModelsQuery.isPending}
        />
        <ProviderSelect
          label="STT"
          options={sttOptions()}
          value={selectedStt()}
          onChange={setSelectedStt}
          disabled={providerModelsQuery.isPending}
        />
        <ProviderSelect
          label="TTS"
          options={ttsOptions()}
          value={selectedTts()}
          onChange={setSelectedTts}
          disabled={providerModelsQuery.isPending}
        />
      </div>
    </div>
  );
}
