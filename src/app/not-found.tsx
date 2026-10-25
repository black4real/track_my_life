import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="brand-mark" aria-hidden="true">k.</span>
      <p className="eyebrow">OUT OF THE INDEX</p>
      <h1>This page hasn’t been kept.</h1>
      <p>That record might have moved, or the address may be incomplete.</p>
      <Link className="button button-primary" href="/">Back to your things <span aria-hidden="true">↗</span></Link>
    </main>
  );
}
