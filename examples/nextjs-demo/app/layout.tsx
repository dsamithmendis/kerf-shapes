export const metadata = { title: "Kerf demo" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0f1115", color: "#e8e8ea" }}>
        {children}
      </body>
    </html>
  );
}
