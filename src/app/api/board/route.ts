import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ rooms: [] }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ rooms: [] });
  }

  const board = await prisma.board.findUnique({
    where: { userId: user.id },
    select: { rooms: true },
  });

  const rooms = board?.rooms ? JSON.parse(String(board.rooms)) : [];

  return NextResponse.json({ rooms: Array.isArray(rooms) ? rooms : [] });
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { rooms?: unknown };
  const rooms = Array.isArray(body.rooms) ? body.rooms : [];

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: {
      email: session.user.email,
      name: session.user.name || session.user.email,
    },
  });

  const board = await prisma.board.upsert({
    where: { userId: user.id },
    update: { rooms: JSON.stringify(rooms) },
    create: { userId: user.id, rooms: JSON.stringify(rooms) },
  });

  return NextResponse.json({ rooms: Array.isArray(JSON.parse(String(board.rooms))) ? JSON.parse(String(board.rooms)) : [] });
}
