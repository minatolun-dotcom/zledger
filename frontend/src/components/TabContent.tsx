/** Wraps tab content with fade-in animation on tab switch.
 *  Wrap all tab content sections inside this component so they animate
 *  when `activeKey` changes (triggered by Tabs onChange). */
export default function TabContent({ activeKey, children }: { activeKey: string; children: React.ReactNode }) {
  return <div key={activeKey} className="animate-fadeIn mt-4">{children}</div>;
}