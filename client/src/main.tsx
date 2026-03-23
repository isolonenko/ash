import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RoomProvider } from "./context/RoomContext";
import { MediaProvider } from "./context/MediaProvider";
import { App } from "./components/App";
import "./styles/global.sass";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RoomProvider>
      <MediaProvider>
        <App />
      </MediaProvider>
    </RoomProvider>
  </StrictMode>,
);
