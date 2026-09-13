import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getAllConnectors } from '@/connectors/registry';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const definitions = getAllConnectors();
    const connectorsWithHealth = await Promise.all(
      definitions.map(async (def) => {
        try {
          const health = await def.connector.health(workspaceId);
          return {
            id: def.id,
            name: def.name,
            description: def.description,
            icon: def.icon,
            authType: def.authType,
            scopes: def.scopes,
            health,
          };
        } catch (err: any) {
          return {
            id: def.id,
            name: def.name,
            description: def.description,
            icon: def.icon,
            authType: def.authType,
            scopes: def.scopes,
            health: {
              connected: false,
              last_synced: null,
              last_error: err.message || 'Health check error',
              sync_window_days: 90,
            },
          };
        }
      })
    );

    return NextResponse.json({ connectors: connectorsWithHealth });
  } catch (err: any) {
    console.error('[API /api/connectors error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to list connectors' }, { status: 500 });
  }
}
