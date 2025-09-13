import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Test endpoint accessible',
    timestamp: new Date().toISOString() 
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ 
      status: 'success', 
      received: body,
      timestamp: new Date().toISOString() 
    });
  } catch {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Invalid JSON',
      timestamp: new Date().toISOString() 
    }, { status: 400 });
  }
}