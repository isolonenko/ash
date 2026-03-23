import { useRoute } from '@/lib/router';
import { useRoomContext } from '@/context/room-context';
import { Landing } from './Landing';
import { Preview } from './Preview';
import { RoomView } from './RoomView';
import { RTCErrorBoundary } from './RTCErrorBoundary';

export function App() {
  const route = useRoute();
  const { state: roomState, leaveRoom } = useRoomContext();

  switch (route.page) {
    case 'landing':
      return <Landing />;
    case 'preview':
      return <Preview roomId={route.roomId} />;
    case 'room':
      return (
        <RTCErrorBoundary
          onLeave={leaveRoom}
          roomId={route.roomId}
          peerId={roomState.peerId ?? ''}
          displayName={roomState.displayName ?? 'Anonymous'}
          initialAudioEnabled={roomState.initialAudioEnabled ?? true}
          initialVideoEnabled={roomState.initialVideoEnabled ?? true}
        >
          <RoomView roomId={route.roomId} />
        </RTCErrorBoundary>
      );
    default:
      return <Landing />;
  }
}
