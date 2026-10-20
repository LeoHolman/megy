"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  deadline?: string;
  roomIds: string[];
  listIds: Record<string, string>;
};

type TodoList = {
  id: string;
  title: string;
  color: string;
  items: TodoItem[];
};

type Room = {
  id: string;
  name: string;
  color: string;
  lists: TodoList[];
};

const palette = ["#f97316", "#a78bfa", "#22c55e", "#38bdf8", "#f43f5e", "#facc15"];

const defaultRooms: Room[] = [
  {
    id: "room-home",
    name: "Home",
    color: "#fbbf24",
    lists: [
      {
        id: "list-kitchen",
        title: "Kitchen",
        color: "#f59e0b",
        items: [
          { id: "it-1", text: "Deep clean the fridge", done: false, deadline: "2026-10-23T18:00", roomIds: ["room-home"], listIds: { "room-home": "list-kitchen" } },
          { id: "it-2", text: "Organize pantry bins", done: true, deadline: "2026-10-21T17:00", roomIds: ["room-home"], listIds: { "room-home": "list-kitchen" } },
          { id: "it-3", text: "Label the jars", done: false, deadline: "2026-10-25T12:30", roomIds: ["room-home"], listIds: { "room-home": "list-kitchen" } },
        ],
      },
      {
        id: "list-laundry",
        title: "Laundry",
        color: "#60a5fa",
        items: [
          { id: "it-4", text: "Wash towels", done: false, deadline: "2026-10-20T09:00", roomIds: ["room-home"], listIds: { "room-home": "list-laundry" } },
          { id: "it-5", text: "Fold sheets", done: false, deadline: "2026-10-22T16:00", roomIds: ["room-home"], listIds: { "room-home": "list-laundry" } },
        ],
      },
    ],
  },
  {
    id: "room-work",
    name: "Work",
    color: "#60a5fa",
    lists: [
      {
        id: "list-projects",
        title: "Projects",
        color: "#0ea5e9",
        items: [
          { id: "it-6", text: "Review client proposal", done: false, deadline: "2026-10-20T15:00", roomIds: ["room-work"], listIds: { "room-work": "list-projects" } },
          { id: "it-7", text: "Book design feedback call", done: true, deadline: "2026-10-19T11:30", roomIds: ["room-work"], listIds: { "room-work": "list-projects" } },
        ],
      },
    ],
  },
];

function normalizeRooms(inputRooms: Room[]): Room[] {
  return inputRooms.map((room) => ({
    ...room,
    lists: (room.lists ?? []).map((list) => ({
      ...list,
      items: (list.items ?? []).map((item) => {
        const roomIds = Array.isArray(item.roomIds) && item.roomIds.length > 0 ? item.roomIds : [room.id];
        const listIds = item.listIds && typeof item.listIds === "object" ? { ...item.listIds } : {};
        if (!listIds[room.id]) {
          listIds[room.id] = list.id;
        }

        return {
          ...item,
          text: item.text ?? "",
          done: Boolean(item.done),
          roomIds,
          listIds,
        } satisfies TodoItem;
      }),
    })),
  }));
}

export default function Home() {
  const { data: session, status } = useSession();
  const [rooms, setRooms] = useState<Room[]>(() => normalizeRooms(defaultRooms));
  const [selectedRoomId, setSelectedRoomId] = useState(defaultRooms[0]?.id ?? "");
  const [selectedListId, setSelectedListId] = useState(defaultRooms[0]?.lists[0]?.id ?? "");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomColor, setNewRoomColor] = useState(palette[0]);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListColor, setNewListColor] = useState(palette[1]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let isMounted = true;

    fetch("/api/board")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load board");
        }
        const payload = (await response.json()) as { rooms?: Room[] };
        const nextRooms = normalizeRooms(Array.isArray(payload.rooms) && payload.rooms.length > 0 ? payload.rooms : defaultRooms);
        if (!isMounted) return;
        setRooms(nextRooms);
        setSelectedRoomId(nextRooms[0]?.id ?? "");
        setSelectedListId(nextRooms[0]?.lists[0]?.id ?? "");
      })
      .catch(() => {
        if (!isMounted) return;
        const fallbackRooms = normalizeRooms(defaultRooms);
        setRooms(fallbackRooms);
        setSelectedRoomId(fallbackRooms[0]?.id ?? "");
        setSelectedListId(fallbackRooms[0]?.lists[0]?.id ?? "");
      });

    return () => {
      isMounted = false;
    };
  }, [status, session?.user?.email]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const timeout = window.setTimeout(() => {
      fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms }),
      }).catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [rooms, status]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null,
    [rooms, selectedRoomId],
  );

  useEffect(() => {
    if (selectedRoom) {
      setNewListColor(selectedRoom.color);
    }
  }, [selectedRoom?.id]);

  const roomTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach((room) => {
      counts[room.id] = room.lists.reduce((sum, list) => {
        return sum + list.items.filter((item) => (item.roomIds ?? []).includes(room.id)).length;
      }, 0);
    });
    return counts;
  }, [rooms]);

  const maxRoomTaskCount = useMemo(() => Math.max(1, ...Object.values(roomTaskCounts)), [roomTaskCounts]);

  const totalRemaining = useMemo(() => {
    const uniqueItemIds = new Set<string>();
    rooms.forEach((room) => {
      room.lists.forEach((list) => {
        list.items.forEach((item) => {
          if ((item.roomIds ?? []).length > 0 && !item.done) {
            uniqueItemIds.add(item.id);
          }
        });
      });
    });
    return uniqueItemIds.size;
  }, [rooms]);

  const selectedRoomRemaining = useMemo(() => {
    if (!selectedRoom) return 0;
    const uniqueItemIds = new Set<string>();
    rooms.forEach((room) => {
      if (room.id !== selectedRoom.id) return;
      room.lists.forEach((list) => {
        list.items.forEach((item) => {
          if ((item.roomIds ?? []).includes(selectedRoom.id) && !item.done) {
            uniqueItemIds.add(item.id);
          }
        });
      });
    });
    return uniqueItemIds.size;
  }, [rooms, selectedRoom]);

  function addRoom() {
    if (!newRoomName.trim()) return;
    const room: Room = {
      id: crypto.randomUUID(),
      name: newRoomName.trim(),
      color: newRoomColor,
      lists: [],
    };
    setRooms((prev) => [room, ...prev]);
    setSelectedRoomId(room.id);
    setSelectedListId("");
    setNewRoomName("");
  }

  function addList() {
    if (!selectedRoom || !newListTitle.trim()) return;
    const list: TodoList = {
      id: crypto.randomUUID(),
      title: newListTitle.trim(),
      color: newListColor,
      items: [],
    };
    setRooms((prev) => prev.map((room) => room.id === selectedRoom.id ? { ...room, lists: [...room.lists, list] } : room));
    setSelectedListId(list.id);
    setNewListTitle("");
  }

  function updateItem(listId: string, itemId: string, patch: Partial<TodoItem>) {
    setRooms((prev) => prev.map((room) => ({
      ...room,
      lists: room.lists.map((list) => ({
        ...list,
        items: list.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
      })),
    })));
  }

  function addItem(listId: string, value: string) {
    const text = value.trim();
    if (!text) return;
    const roomId = rooms.find((room) => room.lists.some((list) => list.id === listId))?.id ?? selectedRoomId;
    const item: TodoItem = {
      id: crypto.randomUUID(),
      text,
      done: false,
      roomIds: [roomId],
      listIds: { [roomId]: listId },
    };
    setRooms((prev) => prev.map((room) => ({
      ...room,
      lists: room.lists.map((list) => list.id === listId ? {
        ...list,
        items: [...list.items, item],
      } : list),
    })));
  }

  function toggleRoomTag(itemId: string, listId: string, roomId: string) {
    setRooms((prev) => {
      const sourceRoom = prev.find((room) => room.lists.some((list) => list.id === listId));
      const targetRoom = prev.find((room) => room.id === roomId);

      if (!sourceRoom || !targetRoom || sourceRoom.id === targetRoom.id) {
        return prev.map((room) => ({
          ...room,
          lists: room.lists.map((list) => {
            if (list.id !== listId) return list;
            return {
              ...list,
              items: list.items.map((item) => {
                if (item.id !== itemId) return item;
                const currentRoomIds = item.roomIds ?? [];
                const hasRoom = currentRoomIds.includes(roomId);
                const nextRoomIds = hasRoom ? currentRoomIds.filter((id) => id !== roomId) : [...new Set([...currentRoomIds, roomId])];
                const nextListIds = { ...(item.listIds ?? {}) };
                if (!hasRoom) {
                  nextListIds[roomId] = listId;
                } else {
                  delete nextListIds[roomId];
                }

                return {
                  ...item,
                  roomIds: nextRoomIds,
                  listIds: nextListIds,
                };
              }),
            };
          }),
        }));
      }

      const sourceItem = sourceRoom.lists.flatMap((list) => list.items).find((item) => item.id === itemId);
      if (!sourceItem) return prev;

      const syncedListTitle = sourceRoom.name;
      const existingSyncedList = targetRoom.lists.find((list) => list.title === syncedListTitle);
      const syncedListId = existingSyncedList?.id ?? crypto.randomUUID();
      const syncedListColor = existingSyncedList?.color ?? sourceRoom.color;

      const currentRoomIds = sourceItem.roomIds ?? [];
      const hasRoom = currentRoomIds.includes(roomId);
      const nextRoomIds = hasRoom ? currentRoomIds.filter((id) => id !== roomId) : [...new Set([...currentRoomIds, roomId])];
      const nextListIds = { ...(sourceItem.listIds ?? {}) };

      if (hasRoom) {
        delete nextListIds[roomId];
      } else {
        nextListIds[roomId] = syncedListId;
      }

      const syncedItem = {
        ...sourceItem,
        roomIds: nextRoomIds,
        listIds: nextListIds,
      };

      return prev.map((room) => {
        if (room.id === targetRoom.id) {
          const targetListExists = room.lists.some((list) => list.title === syncedListTitle);
          const nextLists = room.lists.map((list) => {
            if (list.title !== syncedListTitle) {
              const items = list.items.map((item) => item.id === itemId ? syncedItem : item);
              return { ...list, items };
            }

            const items = hasRoom
              ? list.items.filter((item) => item.id !== itemId)
              : list.items.some((item) => item.id === itemId)
                ? list.items.map((item) => item.id === itemId ? syncedItem : item)
                : [...list.items, syncedItem];

            return { ...list, items };
          });

          if (!targetListExists && !hasRoom) {
            return {
              ...room,
              lists: [{ id: syncedListId, title: syncedListTitle, color: syncedListColor, items: [syncedItem] }, ...nextLists],
            };
          }

          return {
            ...room,
            lists: nextLists,
          };
        }

        const updatedLists = room.lists.map((list) => ({
          ...list,
          items: list.items.map((item) => item.id === itemId ? syncedItem : item),
        }));

        if (room.id === sourceRoom.id && hasRoom) {
          return {
            ...room,
            lists: updatedLists.map((list) => {
              if (list.id !== listId) return list;
              return {
                ...list,
                items: list.items.map((item) => item.id === itemId ? syncedItem : item),
              };
            }),
          };
        }

        return {
          ...room,
          lists: updatedLists,
        };
      });
    });
  }

  function moveItem(listId: string, fromIndex: number, toIndex: number) {
    setRooms((prev) => prev.map((room) => ({
      ...room,
      lists: room.lists.map((list) => {
        if (list.id !== listId) return list;
        const nextItems = [...list.items];
        const [moved] = nextItems.splice(fromIndex, 1);
        if (!moved) return list;
        nextItems.splice(toIndex, 0, moved);
        return { ...list, items: nextItems };
      }),
    })));
  }

  function deleteItem(listId: string, itemId: string) {
    setRooms((prev) => prev.map((room) => ({
      ...room,
      lists: room.lists.map((list) => ({
        ...list,
        items: list.items.filter((item) => item.id !== itemId),
      })),
    })));
  }

  function removeList(listId: string) {
    if (!selectedRoom) return;
    setRooms((prev) => prev.map((room) => room.id === selectedRoom.id ? { ...room, lists: room.lists.filter((list) => list.id !== listId) } : room));
    if (selectedListId === listId) {
      const nextList = selectedRoom.lists.find((list) => list.id !== listId)?.id ?? "";
      setSelectedListId(nextList);
    }
  }

  if (status === "loading") {
    return <main className="app-shell"><div className="signin-panel"><p>Loading your workspace…</p></div></main>;
  }

  if (status !== "authenticated") {
    return (
      <main className="app-shell auth-shell">
        <section className="signin-panel card">
          <p className="eyebrow">Private planning</p>
          <h1>Megy</h1>
          <p className="signin-copy">Sign in with Google to keep each room, list, and checklist private to your account.</p>
          <button className="primary-button" onClick={() => signIn("google", { callbackUrl: "/" })}>
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  if (!selectedRoom) {
    return <main className="app-shell"><div className="signin-panel"><p>Preparing your board…</p></div></main>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Private board</p>
            <h1>Megy</h1>
          </div>
          <div className="user-pill">
            <span>{session?.user?.name?.[0] || "U"}</span>
            <div>
              <strong>{session?.user?.name || "User"}</strong>
              <small>{session?.user?.email || "No email"}</small>
            </div>
          </div>
          <button className="ghost-button full-width" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>

        <div className="room-form card">
          <label>
            <span>Room name</span>
            <input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="Add a bucket" />
          </label>
          <div className="swatch-row">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                className={`swatch ${newRoomColor === color ? "selected" : ""}`}
                style={{ background: color }}
                onClick={() => setNewRoomColor(color)}
                aria-label={`Select ${color}`}
              />
            ))}
          </div>
          <button className="primary-button" onClick={addRoom}>Create room</button>
        </div>

        <div className="rooms-list">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className={`room-button ${selectedRoomId === room.id ? "active" : ""}`}
              style={{ borderColor: room.color }}
              onClick={() => {
                setSelectedRoomId(room.id);
                setSelectedListId(room.lists[0]?.id ?? "");
              }}
            >
              <span className="room-dot" style={{ background: room.color }} />
              <span>{room.name}</span>
              <strong>{room.lists.reduce((sum, list) => sum + list.items.filter((item) => (item.roomIds ?? []).includes(room.id) && !item.done).length, 0)}</strong>
            </button>
          ))}
        </div>

        <div className="room-chart card">
          <div className="chart-header">
            <p className="eyebrow">Room load</p>
            <h3>Tasks by room</h3>
          </div>

          {rooms.length > 0 ? (() => {
            const chartSize = 360;
            const center = chartSize / 2;
            const outerRadius = 96;
            const labelRadius = 136;
            const levels = 5;

            const points = rooms.map((room, index) => {
              const value = roomTaskCounts[room.id] ?? 0;
              const ratio = maxRoomTaskCount > 0 ? value / maxRoomTaskCount : 0;
              const radians = (Math.PI * 2 * index) / rooms.length - Math.PI / 2;
              const distance = outerRadius * ratio;
              const x = center + Math.cos(radians) * distance;
              const y = center + Math.sin(radians) * distance;
              const labelX = center + Math.cos(radians) * labelRadius;
              const labelY = center + Math.sin(radians) * labelRadius;

              return {
                room,
                x,
                y,
                labelX,
                labelY,
                value,
                angle: radians,
              };
            });

            const polygonPoints = points.map(({ x, y }) => `${x},${y}`).join(" ");

            return (
              <svg className="room-web-chart" viewBox={`0 0 ${chartSize} ${chartSize}`} role="img" aria-label="Room task chart">
                {[...Array(levels)].map((_, level) => {
                  const levelRadius = (outerRadius / levels) * (level + 1);
                  const ringPoints = rooms.map((room, index) => {
                    const radians = (Math.PI * 2 * index) / rooms.length - Math.PI / 2;
                    const x = center + Math.cos(radians) * levelRadius;
                    const y = center + Math.sin(radians) * levelRadius;
                    return `${x},${y}`;
                  }).join(" ");

                  return (
                    <polygon
                      key={`ring-${level}`}
                      points={ringPoints}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.65)"
                      strokeWidth="1"
                    />
                  );
                })}

                {points.map(({ room, x, y, labelX, labelY, angle, value }) => (
                  <g key={room.id}>
                    <line
                      x1={center}
                      y1={center}
                      x2={x}
                      y2={y}
                      stroke="rgba(148, 163, 184, 0.8)"
                      strokeWidth="1"
                    />
                    <circle cx={x} cy={y} r="4" fill={room.color} />
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={Math.abs(Math.cos(angle)) < 0.25 ? "middle" : Math.cos(angle) >= 0 ? "start" : "end"}
                      dominantBaseline="middle"
                      fontSize="11"
                      fill={room.color}
                      fontWeight="600"
                    >
                      {room.name}
                    </text>
                    {value > 0 && (
                      <text
                        x={x}
                        y={y - 10}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#1e293b"
                        fontWeight="700"
                      >
                        {value}
                      </text>
                    )}
                  </g>
                ))}

                <polygon
                  points={polygonPoints}
                  fill="rgba(59, 130, 246, 0.2)"
                  stroke="#2563eb"
                  strokeWidth="2"
                />
              </svg>
            );
          })() : null}
        </div>
      </aside>

      <section className="board-panel">
        <header className="board-header" style={{ borderBottomColor: selectedRoom.color }}>
          <div>
            <p className="eyebrow">Room overview</p>
            <h2>{selectedRoom.name}</h2>
          </div>
          <div className="stats-grid">
            <div className="stat-box">
              <span>Remaining</span>
              <strong>{selectedRoomRemaining}</strong>
            </div>
            <div className="stat-box">
              <span>Total</span>
              <strong>{totalRemaining}</strong>
            </div>
          </div>
        </header>

        <div className="list-toolbar card">
          <input value={newListTitle} onChange={(event) => setNewListTitle(event.target.value)} placeholder="New list title" />
          <div className="swatch-row">
            {palette.map((color) => (
              <button
                key={`list-${color}`}
                type="button"
                className={`swatch ${newListColor === color ? "selected" : ""}`}
                style={{ background: color }}
                onClick={() => setNewListColor(color)}
                aria-label={`Select list color ${color}`}
              />
            ))}
          </div>
          <button className="primary-button" onClick={addList}>Add list</button>
        </div>

        <div className="lists-grid">
          {selectedRoom.lists.map((list) => (
            <div key={list.id} className="list-card card" style={{ borderTopColor: list.color }}>
              <div className="list-head">
                <div className="list-title-wrap">
                  <span className="list-swatch" style={{ background: list.color }} />
                  <h3>{list.title}</h3>
                </div>
                <button type="button" className="ghost-button" onClick={() => removeList(list.id)}>Delete</button>
              </div>

              <div className="items-stack">
                {list.items
                  .filter((item) => ((item.roomIds ?? []).includes(selectedRoom.id)) && (item.listIds?.[selectedRoom.id] ?? list.id) === list.id)
                  .map((item, index) => (
                  <div
                    key={item.id}
                    className={`todo-item ${item.done ? "done" : ""}`}
                    draggable
                    onDragStart={() => setDraggedItemId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedItemId && draggedItemId !== item.id) {
                        const fromIndex = list.items.findIndex((entry) => entry.id === draggedItemId);
                        const toIndex = index;
                        if (fromIndex !== -1) {
                          moveItem(list.id, fromIndex, toIndex);
                        }
                      }
                      setDraggedItemId(null);
                    }}
                  >
                    <div className="check-row">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => updateItem(list.id, item.id, { done: !item.done })}
                      />
                      <div className="text-block">
                        <p>{item.text}</p>
                      </div>
                    </div>

                    <div className="item-controls">
                      <div className="room-tag-picker">
                        {rooms.map((room) => (
                          <label key={room.id} className="tag-toggle">
                            <input
                              type="checkbox"
                              checked={(item.roomIds ?? []).includes(room.id)}
                              onChange={() => toggleRoomTag(item.id, list.id, room.id)}
                            />
                            <span>{room.name}</span>
                          </label>
                        ))}
                      </div>
                      <button type="button" className="delete-item" onClick={() => deleteItem(list.id, item.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              <AddItemInput listId={list.id} addItem={addItem} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function AddItemInput({ listId, addItem }: { listId: string; addItem: (listId: string, value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="add-item-row">
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Add checklist item" />
      <button
        type="button"
        className="primary-button small"
        onClick={() => {
          addItem(listId, value);
          setValue("");
        }}
      >
        Add
      </button>
    </div>
  );
}
