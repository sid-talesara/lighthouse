export const DEFAULT_GENERATE_MODEL = 'gpt-5.5';

export type GenerateModel =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini';

export interface GenerateModelOption {
  value: GenerateModel;
  label: string;
}

export const GENERATE_MODEL_OPTIONS: GenerateModelOption[] = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
];
