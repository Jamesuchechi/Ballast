import { NextResponse } from 'next/server';
import { wakeWorker } from '@/utils/wakeWorker';

export async function GET() {
  wakeWorker();
  return NextResponse.json({
    status: 'ok',
    message: 'Worker wake-up triggered',
    timestamp: new Date().toISOString(),
  });
}
