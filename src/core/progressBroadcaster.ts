import { EventEmitter } from 'node:events';

export interface ProgressEventPayload {
  briefId: string;
  step: string;
  message: string;
  status: 'queued' | 'running' | 'published' | 'failed';
  timestamp: string;
  error?: string | null;
  progress?: any[];
}

class ProgressBroadcaster extends EventEmitter {
  constructor() {
    super();
    // Allow up to 100 concurrent listeners per event
    this.setMaxListeners(100);
  }

  broadcast(briefId: string, payload: ProgressEventPayload) {
    this.emit(`progress:${briefId}`, payload);
  }

  subscribe(briefId: string, listener: (payload: ProgressEventPayload) => void): () => void {
    const eventName = `progress:${briefId}`;
    this.on(eventName, listener);
    return () => {
      this.off(eventName, listener);
    };
  }
}

export const progressBroadcaster = new ProgressBroadcaster();
