// A view the route returns to before its leave finished (A → B → A within 240 ms) keeps its DOM
// node: its fade (fill forwards) and its lanes' retract would leave it invisible and bare. Reviving
// it cancels every animation under it and forgets the leave, so it can enter again.
type Revivable = {
  dataset: DOMStringMap;
  getAnimations(options?: GetAnimationsOptions): readonly Pick<Animation, 'cancel'>[];
};

export function revive(view: Revivable): boolean {
  if (!view.dataset.leavingStarted) return false;
  for (const a of view.getAnimations({ subtree: true })) a.cancel();
  delete view.dataset.leavingStarted;
  return true;
}
