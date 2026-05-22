"use client";

import { useEffect, useState } from "react";

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(
      "remio-history"
    );

    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-10">
          Historia kosztorysów
        </h1>

        {history.length === 0 && (
          <p className="text-zinc-400">
            Brak zapisanych kosztorysów.
          </p>
        )}

        <div className="space-y-6">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
            >
              <div className="flex justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">
                    Kosztorys
                  </h2>

                  <p className="text-zinc-400">
                    {item.date}
                  </p>
                </div>

                <div className="text-3xl font-bold">
                  {item.estimate.total} PLN
                </div>
              </div>

              <div className="space-y-3">
                {item.estimate.tasks.map(
                  (
                    task: any,
                    index: number
                  ) => (
                    <div
                      key={index}
                      className="flex justify-between border-b border-zinc-800 pb-2"
                    >
                      <span>
                        {task.name}
                      </span>

                      <span>
                        {task.price} PLN
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}