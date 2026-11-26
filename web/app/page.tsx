export default function Home() {
  return (
    <main style={{ padding: 64, fontSize: 28, lineHeight: 1.6 }}>
      <h1>Slowride Pull Board</h1>
      <p>Open a screen:</p>
      <ul>
        <li><a href="/display?screen=front">Front of store</a></li>
        <li><a href="/display?screen=back">Back of store</a></li>
      </ul>
      <p style={{ opacity: 0.6, fontSize: 20 }}>Add #key=… when DISPLAY_KEY is set.</p>
    </main>
  );
}
