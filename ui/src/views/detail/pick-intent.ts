// An item opened to pick one of its decision's options (Triage's «Elegir una opción…»): the phone's
// item page opens its pick sheet at once, once. Asked for one item at a time; taking it clears it.

let asked: string | null = null;

export function askPick(id: string): void {
  asked = id;
}

export function takePick(id: string): boolean {
  if (asked !== id) return false;
  asked = null;
  return true;
}
