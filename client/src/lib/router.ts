import { useState, useEffect } from "react";

// ── Route Type Definition ─

export type Route =
  | { page: "landing" }
  | { page: "preview"; roomId: string }
  | { page: "room"; roomId: string };

// ── Hash Parsing ─

export const parseHash = (hash: string): Route => {
  // Handle empty hash or "#/" as landing
  if (!hash || hash === "#" || hash === "#/") {
    return { page: "landing" };
  }

  // Match: #/room/{id}/preview
  const previewMatch = hash.match(/^#\/room\/([a-z\-]+)\/preview$/);
  if (previewMatch) {
    return { page: "preview", roomId: previewMatch[1] };
  }

  // Match: #/room/{id}
  const roomMatch = hash.match(/^#\/room\/([a-z\-]+)$/);
  if (roomMatch) {
    return { page: "room", roomId: roomMatch[1] };
  }

  // Default fallback
  return { page: "landing" };
};

// ── Navigation ─

export const navigateTo = (route: Route): void => {
  if (route.page === "landing") {
    window.location.hash = "#/";
  } else if (route.page === "preview") {
    window.location.hash = `#/room/${route.roomId}/preview`;
  } else if (route.page === "room") {
    window.location.hash = `#/room/${route.roomId}`;
  }
};

// ── React Hook ─

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash)
  );

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
};
