import { useEffect, useState } from "react";

const ROUTES = ["overview", "processes", "detections", "graph", "audit", "chunks"] as const;
export type Route = (typeof ROUTES)[number];

function parseHash(): Route {
  const h = window.location.hash.replace("#/", "") as Route;
  return ROUTES.includes(h) ? h : "overview";
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
  };

  return [route, navigate];
}
