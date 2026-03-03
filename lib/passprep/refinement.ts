export type RefinementMode = 'global' | 'targeted';
export type TargetedScope = 'all' | 'categoryId' | 'videoIds' | 'descriptions-only' | 'titles-only';

export type RefinementScope = {
  mode: RefinementMode;
  target: TargetedScope;
  categoryId: string;
  videoIds: string;
};

export type RefinementMessage = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  timestamp: string;
};
