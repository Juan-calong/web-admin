import { Suspense } from "react";
import LoginClient from "../LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Carregando…</div>}>
      <LoginClient />
    </Suspense>
  );
}
