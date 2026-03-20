import { useState, useCallback, useEffect, useRef } from "react";

interface PiPResult {
  isSupported: boolean;
  isActive: boolean;
  toggle: () => void;
  setVideoElement: (el: HTMLVideoElement | null) => void;
}

export function usePictureInPicture(): PiPResult {
  const [isActive, setIsActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isSupported = "pictureInPictureEnabled" in document;

  const handleEnter = useCallback(() => setIsActive(true), []);
  const handleLeave = useCallback(() => setIsActive(false), []);

  const toggle = useCallback(async () => {
    if (!isSupported) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // PiP can fail if video has no source or user denied
    }
  }, [isSupported]);

  const setVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      const prev = videoRef.current;
      if (prev) {
        prev.removeEventListener("enterpictureinpicture", handleEnter);
        prev.removeEventListener("leavepictureinpicture", handleLeave);
      }

      videoRef.current = el;

      if (el) {
        el.addEventListener("enterpictureinpicture", handleEnter);
        el.addEventListener("leavepictureinpicture", handleLeave);
      }
    },
    [handleEnter, handleLeave],
  );

  useEffect(() => {
    return () => {
      const el = videoRef.current;
      if (el) {
        el.removeEventListener("enterpictureinpicture", handleEnter);
        el.removeEventListener("leavepictureinpicture", handleLeave);
      }
    };
  }, [handleEnter, handleLeave]);

  return { isSupported, isActive, toggle, setVideoElement };
}
