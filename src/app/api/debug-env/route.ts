import { NextRequest, NextResponse } from 'next/server';
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== 'Bearer ' + process.env.AUTOMATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    FACEBOOK_PAGE_ID: process.env.FACEBOOK_PAGE_ID ?? 'MISSING',
    INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID ?? 'MISSING',
    FB_TOKEN_PREFIX: process.env.FACEBOOK_ACCESS_TOKEN ? process.env.FACEBOOK_ACCESS_TOKEN.slice(0,20) : 'MISSING',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING',
    WORKER_SECRET: process.env.WORKER_SECRET ? 'SET' : 'MISSING',
  });
}