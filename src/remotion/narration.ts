export const ARCHITECTURE_NARRATION = [
  'Lighthouse turns a codebase into a reviewed architecture index. The data file is the contract, and the app renders only that structure.',
  'Start with the repo map, then zoom into clusters and modules. That gives you the product surfaces first, then the implementation boundaries underneath them.',
  'Follow the service path next. The web app and API sit in the middle, workers and the Python runner carry execution, and WebSocket plus the extension handle live recording.',
  'Then land on evidence. Changed modules, key files, and related sections make every claim traceable to concrete paths and summaries.',
  'For questions and change review, use the index as the fast evidence layer, and let the local coding agent do the reasoning and rendering work.',
].join(' ');
