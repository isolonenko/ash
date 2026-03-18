import { useRoute } from "@/lib/router";
import { Landing } from "./Landing";
import { Preview } from "./Preview";
import { RoomView } from "./RoomView";

export function App() {
  const route = useRoute();

  switch (route.page) {
    case "landing":
      return <Landing />;
    case "preview":
      return <Preview roomId={route.roomId} />;
    case "room":
      return <RoomView roomId={route.roomId} />;
    default:
      return <Landing />;
  }
}
