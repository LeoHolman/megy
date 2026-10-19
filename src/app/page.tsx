"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ReminderOption = "none" | "at-time" | "1h" | "1d";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  deadline?: string;
  reminder?: ReminderOption;
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

type UserSession = {
  email: string;
  name: string;
  picture?: string;
};

function readSavedUser(): UserSession | null {
  if (typeof window === "undefined") return null;
  const savedUser = window.localStorage.getItem(SESSION_KEY);
  if (!savedUser) return null;

  try {
    return JSON.parse(savedUser) as UserSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (element: Element, options: { theme?: string; size?: string; type?: string }) => void;
          revoke: (hint: string) => void;
        };
      };
    };
  }
}

const STORAGE_KEY = "megy-board-v1";
const SESSION_KEY = "megy-user-session-v1";

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
          { id: "it-1", text: "Deep clean the fridge", done: false, deadline: "2026-10-23T18:00", reminder: "1h" },
          { id: "it-2", text: "Organize pantry bins", done: true, deadline: "2026-10-21T17:00", reminder: "1d" },
          { id: "it-3", text: "Label the jars", done: false, deadline: "2026-10-25T12:30", reminder: "none" },
        ],
      },
      {
        id: "list-laundry",
        title: "Laundry",
        color: "#60a5fa",
        items: [
          { id: "it-4", text: "Wash towels", done: false, deadline: "2026-10-20T09:00", reminder: "at-time" },
          { id: "it-5", text: "Fold sheets", done: false, deadline: "2026-10-22T16:00", reminder: "1d" },
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
          { id: "it-6", text: "Review client proposal", done: false, deadline: "2026-10-20T15:00", reminder: "1h" },
          { id: "it-7", text: "Book design feedback call", done: true, deadline: "2026-10-19T11:30", reminder: "1d" },
        ],
      },
    ],
  },
];

const reminderLabels: Record<ReminderOption, string> = {
  none: "No reminder",
  "at-time": "At deadline",
  "1h": "1 hour before",
  "1d": "1 day before",
};

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

function loadStoredBoards(userEmail?: string) {
  if (typeof window === "undefined") return defaultRooms;
  const key = userEmail ? `megy-board-${userEmail}` : STORAGE_KEY;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaultRooms;
    const parsed = JSON.parse(raw) as Room[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultRooms;
  } catch {
    return defaultRooms;
  }
}

export default function Home() {
  const [user, setUser] = useState<UserSession | null>(() => readSavedUser());
  const [rooms, setRooms] = useState<Room[]>(() => {
    const savedUser = readSavedUser();
    return loadStoredBoards(savedUser?.email);
  });
  const [selectedRoomId, setSelectedRoomId] = useState(() => {
    const savedUser = readSavedUser();
    const stored = loadStoredBoards(savedUser?.email);
    return stored[0]?.id ?? defaultRooms[0]?.id ?? "";
  });
  const [selectedListId, setSelectedListId] = useState(() => {
    const savedUser = readSavedUser();
    const stored = loadStoredBoards(savedUser?.email);
    return stored[0]?.lists[0]?.id ?? defaultRooms[0]?.lists[0]?.id ?? "";
  });
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomColor, setNewRoomColor] = useState(palette[0]);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListColor, setNewListColor] = useState(palette[1]);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  function handleDemoSignIn() {
    const nextUser = { email: "demo@megy.app", name: "Demo User" };
    setUser(nextUser);
    const stored = loadStoredBoards(nextUser.email);
    setRooms(stored);
    setSelectedRoomId(stored[0]?.id ?? defaultRooms[0].id);
    setSelectedListId(stored[0]?.lists[0]?.id ?? defaultRooms[0].lists[0]?.id ?? "");
  }

  function handleGoogleLogin(nextUser: UserSession) {
    setUser(nextUser);
    const stored = loadStoredBoards(nextUser.email);
    setRooms(stored);
    setSelectedRoomId(stored[0]?.id ?? defaultRooms[0].id);
    setSelectedListId(stored[0]?.lists[0]?.id ?? defaultRooms[0].lists[0]?.id ?? "");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = user ? `megy-board-${user.email}` : STORAGE_KEY;
    window.localStorage.setItem(storageKey, JSON.stringify(rooms));
  }, [rooms, user]);

  useEffect(() => {
    if (!user && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    }
  }, [rooms, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      return;
    }
    window.localStorage.removeItem(SESSION_KEY);
  }, [user]);

  useEffect(() => {
    if (!googleClientId || typeof window === "undefined") return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => {
            if (!response.credential) return;
            const base64Payload = response.credential.split(".")[1];
            if (!base64Payload) return;
            const decoded = JSON.parse(atob(base64Payload));
            handleGoogleLogin({
              email: decoded.email,
              name: decoded.name || decoded.email,
              picture: decoded.picture,
            });
          },
        });
        setGoogleReady(true);
      }
    };
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current || user || !window.google) return;
    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      type: "standard",
    });
  }, [googleReady, user]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
  );

  const totalRemaining = useMemo(
    () => rooms.reduce((sum, room) => sum + room.lists.reduce((listTotal, list) => listTotal + list.items.filter((item) => !item.done).length, 0), 0),
    [rooms],
  );

  const selectedRoomRemaining = useMemo(
    () => (selectedRoom ? selectedRoom.lists.reduce((sum, list) => sum + list.items.filter((item) => !item.done).length, 0) : 0),
    [selectedRoom],
  );

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
      lists: room.lists.map((list) => list.id === listId ? {
        ...list,
        items: list.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
      } : list),
    })));
  }

  function addItem(listId: string, value: string) {
    const text = value.trim();
    if (!text) return;
    setRooms((prev) => prev.map((room) => ({
      ...room,
      lists: room.lists.map((list) => list.id === listId ? {
        ...list,
        items: [...list.items, { id: crypto.randomUUID(), text, done: false, reminder: "none" }],
      } : list),
    })));
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
      lists: room.lists.map((list) => list.id === listId ? { ...list, items: list.items.filter((item) => item.id !== itemId) } : list),
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

  const handleCalendarLink = (item: TodoItem, list: TodoList) => {
    const start = item.deadline ? new Date(item.deadline) : new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const title = encodeURIComponent(`${list.title}: ${item.text}`);
    const details = encodeURIComponent(`Checklist item from ${selectedRoom?.name || "room"}\nReminder: ${reminderLabels[item.reminder || "none"]}`);
    const startValue = start.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const endValue = end.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${startValue}/${endValue}`;
  };

  if (!selectedRoom) {
    return <div className="app-shell">Loading…</div>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Private board</p>
            <h1>Megy</h1>
          </div>
          {user ? (
            <div className="user-pill">
              <span>{user.name[0]}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
          ) : (
            <div className="signin-stack">
              <button className="primary-button" onClick={handleDemoSignIn}>Continue as demo user</button>
              {googleClientId && <div ref={googleButtonRef} className="google-button-wrap" />}
              {!googleClientId && <p className="muted">Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable real Google Sign-In.</p>}
            </div>
          )}
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
              <strong>{room.lists.reduce((sum, list) => sum + list.items.filter((item) => !item.done).length, 0)}</strong>
            </button>
          ))}
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
                {list.items.map((item, index) => (
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
                        <div className="meta-row">
                          {item.deadline && <span className="meta-chip">Due {new Date(item.deadline).toLocaleString()}</span>}
                          {item.reminder && item.reminder !== "none" && <span className="meta-chip">{reminderLabels[item.reminder]}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="item-controls">
                      <input
                        type="datetime-local"
                        value={item.deadline ?? ""}
                        onChange={(event) => updateItem(list.id, item.id, { deadline: event.target.value || undefined })}
                      />
                      <select
                        value={item.reminder ?? "none"}
                        onChange={(event) => updateItem(list.id, item.id, { reminder: event.target.value as ReminderOption })}
                      >
                        {Object.entries(reminderLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <a href={handleCalendarLink(item, list)} target="_blank" rel="noreferrer" className="calendar-link">
                        Calendar
                      </a>
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
