/** Modal stacking — tracks open modals so Escape only closes the topmost. */
let stackDepth = 0;

export const modalStack = {
  push: () => ++stackDepth,
  pop: () => { if (stackDepth > 0) stackDepth--; return stackDepth; },
  get top(): boolean { return stackDepth === 0; },
  get depth(): number { return stackDepth; },
};