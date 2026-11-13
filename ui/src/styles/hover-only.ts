import type { AtRule, Container, Plugin, Rule } from 'postcss';

// A finger cannot hover: on a touch screen a press leaves :hover stuck on what it touched, so a row
// lights up under the finger and stays lit. Every :hover style is built under @media (hover: hover),
// so a screen with a mouse keeps it unchanged and a touch screen never sees it. A rule whose list
// mixes hover and other selectors is split: the others keep the rule, the hover ones follow it in a
// copy, at the same place in the cascade.

const HOVER = /:hover(?![\w-])/;
const HOVER_QUERY = /\(\s*(?:any-)?hover\s*:/;

function underHoverQuery(rule: Rule): boolean {
  for (let p: Container | undefined = rule.parent; p; p = p.parent as Container | undefined) {
    if (
      p.type === 'atrule' &&
      (p as AtRule).name === 'media' &&
      HOVER_QUERY.test((p as AtRule).params)
    )
      return true;
  }
  return false;
}

export function hoverOnly(): Plugin {
  return {
    postcssPlugin: 'otea-hover-only',
    Once(root, { AtRule: MakeAtRule }) {
      const rules: Rule[] = [];
      root.walkRules((rule) => {
        if (HOVER.test(rule.selector) && !underHoverQuery(rule)) rules.push(rule);
      });
      for (const rule of rules) {
        const parent = rule.parent;
        if (!parent || (parent.type === 'atrule' && /keyframes$/.test((parent as AtRule).name)))
          continue;
        const hover = rule.selectors.filter((s) => HOVER.test(s));
        const rest = rule.selectors.filter((s) => !HOVER.test(s));
        const media = new MakeAtRule({ name: 'media', params: '(hover: hover)' });
        media.raws.before = rule.raws.before ?? '';
        if (rest.length === 0) {
          rule.replaceWith(media);
          rule.raws.before = ' ';
          media.append(rule);
        } else {
          const copy = rule.clone({ selectors: hover });
          copy.raws.before = ' ';
          rule.selectors = rest;
          rule.after(media);
          media.raws.before = ' ';
          media.append(copy);
        }
      }
    },
  };
}
hoverOnly.postcss = true as const;
