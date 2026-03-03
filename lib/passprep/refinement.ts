export type TargetedScope = 'all' | 'categoryId' | 'videoIds';

export type RefinementScope = {
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
