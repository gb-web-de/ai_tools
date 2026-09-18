// SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
//
// The rule is selected from a fixed table instead of being executed. The set of
// reachable behaviours is closed and known at build time.
const RULES = {
  alwaysVisible: () => true,
  adminOnly: (context) => context.isAdmin === true,
  hasSelection: (context) => context.selection.length > 0,
};

export function applyFieldRule(element, ruleName, context) {
  const rule = RULES[ruleName];
  if (!rule) {
    throw new Error(`Unknown field rule: ${ruleName}`);
  }

  element.hidden = !rule(context);
}
