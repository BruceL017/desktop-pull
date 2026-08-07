import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const longPressDelay = 200;
const scrollEdge = 96;
const maximumScrollStep = 20;

interface DragPreview {
  label: string;
  x: number;
  y: number;
}

interface PointerSession<Payload> {
  payload: Payload;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  movedAfterActivation: boolean;
  element: HTMLElement;
  label: string;
  timer: ReturnType<typeof setTimeout>;
}

interface DirectDragOptions<Payload> {
  onStart(payload: Payload): void;
  onHover(payload: Payload, x: number, y: number): void;
  onDrop(payload: Payload, x: number, y: number): void;
  onCancel(payload: Payload): void;
}

function edgeScrollStep(y: number): number {
  const viewportHeight = window.innerHeight;
  const threshold = Math.min(scrollEdge, viewportHeight / 4);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
  if (y < threshold && window.scrollY > 0) {
    return -Math.ceil(maximumScrollStep * (1 - y / threshold));
  }
  if (y > viewportHeight - threshold && window.scrollY < maxScroll) {
    return Math.ceil(maximumScrollStep * (1 - (viewportHeight - y) / threshold));
  }
  return 0;
}

export function useEdgeAutoScroll(onFrame: (x: number, y: number) => void) {
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const stop = useCallback(() => {
    pointerRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const step = useCallback(() => {
    const pointer = pointerRef.current;
    if (!pointer) {
      frameRef.current = null;
      return;
    }
    const amount = edgeScrollStep(pointer.y);
    if (amount === 0) {
      frameRef.current = null;
      return;
    }
    window.scrollBy(0, amount);
    onFrameRef.current(pointer.x, pointer.y);
    frameRef.current = requestAnimationFrame(step);
  }, []);

  const update = useCallback(
    (x: number, y: number) => {
      pointerRef.current = { x, y };
      if (frameRef.current === null && edgeScrollStep(y) !== 0) {
        frameRef.current = requestAnimationFrame(step);
      }
    },
    [step],
  );

  useEffect(() => stop, [stop]);
  return { stop, update };
}

export function useDirectPointerDrag<Payload>(options: DirectDragOptions<Payload>) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sessionRef = useRef<PointerSession<Payload> | null>(null);
  const suppressClickRef = useRef(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);

  const hover = useCallback((x: number, y: number) => {
    const session = sessionRef.current;
    if (session?.active) optionsRef.current.onHover(session.payload, x, y);
  }, []);
  const autoScroll = useEdgeAutoScroll(hover);

  const finish = useCallback(
    (drop: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      clearTimeout(session.timer);
      autoScroll.stop();
      if (session.element.hasPointerCapture(session.pointerId)) {
        session.element.releasePointerCapture(session.pointerId);
      }
      if (session.active && drop && session.movedAfterActivation) {
        optionsRef.current.onDrop(session.payload, session.x, session.y);
      } else if (session.active) {
        optionsRef.current.onCancel(session.payload);
      }
      if (session.active) {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      sessionRef.current = null;
      setPreview(null);
    },
    [autoScroll.stop],
  );

  const start = useCallback(
    (event: ReactPointerEvent<HTMLElement>, payload: Payload, label: string) => {
      if (event.pointerType === "mouse") return;
      const element = event.currentTarget;
      const session: PointerSession<Payload> = {
        payload,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
        movedAfterActivation: false,
        element,
        label,
        timer: setTimeout(() => undefined, longPressDelay),
      };
      clearTimeout(session.timer);
      session.timer = setTimeout(() => {
        if (sessionRef.current !== session) return;
        try {
          element.setPointerCapture(session.pointerId);
        } catch {
          sessionRef.current = null;
          return;
        }
        session.active = true;
        suppressClickRef.current = true;
        setPreview({ label, x: session.x, y: session.y });
        optionsRef.current.onStart(payload);
      }, longPressDelay);
      sessionRef.current = session;
    },
    [],
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      session.x = event.clientX;
      session.y = event.clientY;
      const distance = Math.hypot(
        event.clientX - session.startX,
        event.clientY - session.startY,
      );
      if (!session.active && distance > 8) {
        clearTimeout(session.timer);
        sessionRef.current = null;
        return;
      }
      if (!session.active) return;
      event.preventDefault();
      if (distance > 2) session.movedAfterActivation = true;
      setPreview({ label: session.label, x: event.clientX, y: event.clientY });
      optionsRef.current.onHover(session.payload, event.clientX, event.clientY);
      autoScroll.update(event.clientX, event.clientY);
    },
    [autoScroll.update],
  );

  const end = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (sessionRef.current?.pointerId !== event.pointerId) return;
      if (sessionRef.current.active) event.preventDefault();
      finish(true);
    },
    [finish],
  );

  const cancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (sessionRef.current?.pointerId !== event.pointerId) return;
      finish(false);
    },
    [finish],
  );

  useEffect(() => {
    if (!preview) return;
    const preventTouchScroll = (event: TouchEvent) => event.preventDefault();
    window.addEventListener("touchmove", preventTouchScroll, { passive: false });
    return () => window.removeEventListener("touchmove", preventTouchScroll);
  }, [preview]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) clearTimeout(session.timer);
      autoScroll.stop();
    },
    [autoScroll.stop],
  );

  return {
    abort: () => finish(false),
    cancel,
    end,
    isDragging: preview !== null,
    move,
    preview,
    start,
    suppressesClick: () => suppressClickRef.current,
  };
}
