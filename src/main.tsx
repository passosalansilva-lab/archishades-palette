import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupSupabaseFunctionAuthGuard } from "@/lib/supabaseFunctionGuard";
import { ThemeProvider } from "@/components/ThemeProvider";

// Configura o guard global para todas as chamadas supabase.functions.invoke
setupSupabaseFunctionAuthGuard();

// Register service worker ONLY for the dashboard scope.
//
// Reason: the public customer menu must behave as a normal web page (no PWA/cache),
// and a SW registered at "/" can keep controlling "/menu/*" causing "white screen"
// until a manual reload.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const path = window.location.pathname;
    const isDashboard = path === "/dashboard" || path.startsWith("/dashboard/");

    // If we're NOT in dashboard, ensure no previous SW controls this page.
    // (users may have visited the dashboard before, which registered a SW at scope '/').
    if (!isDashboard) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));

        // Also clear old caches used by the SW.
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("cardpon-cache-") || k.includes("workbox") || k.includes("supabase"))
              .map((k) => caches.delete(k))
          );
        }

        // If the page was already controlled by a SW, force a single reload to detach.
        // Avoid reload loops with a session flag.
        const flag = "sw-unregistered-once";
        if (navigator.serviceWorker.controller && !sessionStorage.getItem(flag)) {
          sessionStorage.setItem(flag, "1");
          window.location.reload();
          return;
        }
      } catch {
        // ignore
      }

      return;
    }

    // Dashboard: register SW with a narrow scope so it never controls the public menu.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/dashboard/" })
      .then((registration) => {
        console.log("Service Worker registered:", registration.scope);

        // Check for updates periodically (not on every load to avoid loops)
        setTimeout(() => {
          registration.update().catch(() => undefined);
        }, 60000); // Check after 1 minute

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              console.log("New service worker version available");
            }
          });
        });
      })
      .catch((error) => {
        console.log("Service Worker registration failed:", error);
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);

