// Vitest setup: silence recharts' jsdom size warnings (measuring a
// container has no layout in jsdom — the assertions don't depend on it).
// Kept minimal: no global mocks of next/* (these tests are unit-level,
// they import product components, not pages).
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const first = String(args[0] ?? "");
  if (first.includes("width(-Infinity)") || first.includes("size") && first.includes("0")) {
    return;
  }
  warn(...args);
};
