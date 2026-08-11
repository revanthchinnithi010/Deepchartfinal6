import { PageTransition } from "@/components/animations";

export default function Trade() {
  return (
    <PageTransition style={{
      flex:           1,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            12,
      color:          "rgba(148,163,184,0.5)",
      userSelect:     "none",
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v18H3z" opacity=".3"/>
        <path d="M8 12h8M12 8v8"/>
      </svg>
      <span style={{ fontSize: 15, fontWeight: 500 }}>Trade Panel</span>
      <span style={{ fontSize: 12, opacity: 0.6 }}>Coming soon</span>
    </PageTransition>
  );
}
