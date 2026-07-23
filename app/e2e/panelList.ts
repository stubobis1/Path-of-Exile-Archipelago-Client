// Shared panel list for e2e/panels.spec.ts and e2e/connected-panels.spec.ts —
// one entry per Sidebar.tsx NAV/NAV_BOTTOM item, with a marker string that
// only appears once that panel's own content has mounted.
export const PANELS: { label: string; marker: string | RegExp }[] = [
  { label: 'Dashboard',       marker: 'Status' },
  { label: 'Gear',            marker: 'Equipment' },
  { label: 'Items',           marker: 'Items' },
  { label: 'Locations',       marker: 'Locations' },
  { label: 'Goal',            marker: 'Goal' },
  { label: 'Settings',        marker: 'Settings' },
  { label: 'Yaml Gen',        marker: 'Yaml Generator' },
  { label: 'First-time Setup', marker: /Step \d/ },
]
