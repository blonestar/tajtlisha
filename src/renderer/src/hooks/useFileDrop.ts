import { useEffect, useRef, useState } from 'react';

export type FileDropOptions = {
  /** When false, drops are ignored and the overlay stays hidden; the browser default is still prevented. */
  enabled: boolean;
  /** Receives the first file of a drop. */
  onFile: (file: File) => void;
};

export type FileDrop = {
  /** True while a file is dragged over the window and drops are enabled. */
  dragging: boolean;
};

/** Only drags that carry files count. Text or links dragged inside the page keep their own behaviour. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Window-level file drop. Without this, dropping a file on the window makes
 * Electron navigate to it. Every file drag is prevented here, and an accepted
 * drop calls onFile.
 */
export function useFileDrop({ enabled, onFile }: FileDropOptions): FileDrop {
  const [dragging, setDragging] = useState(false);
  // Listeners are attached once; they read the latest values through refs.
  const enabledRef = useRef(enabled);
  const onFileRef = useRef(onFile);
  const depthRef = useRef(0);

  useEffect(() => {
    enabledRef.current = enabled;
    onFileRef.current = onFile;
  });

  useEffect(() => {
    const reset = (): void => {
      depthRef.current = 0;
      setDragging(false);
    };

    // dragenter and dragleave fire for every child element the pointer crosses, so a depth counter
    // tells when the pointer has really left the window.
    const handleDragEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (!enabledRef.current) return;
      depthRef.current += 1;
      setDragging(true);
    };

    const handleDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = enabledRef.current ? 'copy' : 'none';
      }
    };

    const handleDragLeave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setDragging(false);
    };

    const handleDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      const accepted = enabledRef.current;
      reset();
      const file = event.dataTransfer?.files[0];
      if (accepted && file) onFileRef.current(file);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);

  return { dragging: enabled && dragging };
}
