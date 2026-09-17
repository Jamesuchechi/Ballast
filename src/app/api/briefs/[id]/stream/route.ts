import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { progressBroadcaster, type ProgressEventPayload } from '@/core/progressBroadcaster';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: briefId } = await params;

    const initialBrief = await queryOne<{
      id: string;
      status: string;
      progress: any;
      error: string | null;
      published_at: string | null;
    }>(
      `SELECT id, status, progress, error, published_at FROM briefs WHERE id = $1`,
      [briefId]
    );

    if (!initialBrief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;

        const sendEvent = (data: any) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            isClosed = true;
          }
        };

        const closeStream = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch {}
          }
        };

        // 1. Send initial state
        const initialProgress = initialBrief.progress || [];
        const latestStep = initialProgress.length > 0 ? initialProgress[initialProgress.length - 1] : null;

        sendEvent({
          briefId,
          status: initialBrief.status,
          step: latestStep?.step || 'queued',
          message: latestStep?.message || 'Queued',
          timestamp: latestStep?.timestamp || new Date().toISOString(),
          error: initialBrief.error,
          progress: initialProgress,
        });

        // If already completed/failed, close immediately
        if (initialBrief.status === 'published' || initialBrief.status === 'failed') {
          closeStream();
          return;
        }

        // 2. Subscribe to real-time broadcaster events
        const unsubscribe = progressBroadcaster.subscribe(briefId, (payload: ProgressEventPayload) => {
          sendEvent(payload);
          if (payload.status === 'published' || payload.status === 'failed') {
            unsubscribe();
            closeStream();
          }
        });

        // 3. Heartbeat & DB fallback poll (every 2s) to handle network edge cases
        const pollInterval = setInterval(async () => {
          if (isClosed) {
            clearInterval(pollInterval);
            return;
          }

          try {
            const current = await queryOne<{
              status: string;
              progress: any;
              error: string | null;
            }>(
              `SELECT status, progress, error FROM briefs WHERE id = $1`,
              [briefId]
            );

            if (current) {
              if (current.status === 'published' || current.status === 'failed') {
                clearInterval(pollInterval);
                unsubscribe();
                const prog = current.progress || [];
                const last = prog.length > 0 ? prog[prog.length - 1] : null;
                sendEvent({
                  briefId,
                  status: current.status,
                  step: last?.step || current.status,
                  message: last?.message || current.status,
                  timestamp: new Date().toISOString(),
                  error: current.error,
                  progress: prog,
                });
                closeStream();
              }
            }
          } catch {
            // Ignore background check transient errors
          }
        }, 2000);

        // 4. Handle client disconnection
        req.signal.addEventListener('abort', () => {
          isClosed = true;
          clearInterval(pollInterval);
          unsubscribe();
          try {
            controller.close();
          } catch {}
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[SSE STREAM ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Streaming failed' }, { status: 500 });
  }
}
