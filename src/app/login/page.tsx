"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";

import pdfMake from "pdfmake/build/pdfmake";
import "pdfmake/build/vfs_fonts";

import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleLogin() {
    setLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword(
        {
          email,
          password,
        }
      );

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    router.push("/");

    setLoading(false);
  }

  async function handleRegister() {
    setLoading(true);

    const { error } =
      await supabase.auth.signUp({
        email,
        password,
      });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    alert(
      "Konto utworzone. Możesz się zalogować."
    );

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
        <h1 className="text-4xl font-bold text-white text-center">
          Remio AI
        </h1>

        <p className="text-zinc-400 text-center mt-3">
          Logowanie do panelu
        </p>

        <div className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
            className="w-full bg-black border border-zinc-700 rounded-2xl px-4 py-4 text-white"
          />

          <input
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            className="w-full bg-black border border-zinc-700 rounded-2xl px-4 py-4 text-white"
          />

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-white text-black py-4 rounded-2xl font-semibold"
          >
            Zaloguj się
          </button>

          <button
            onClick={
              handleRegister
            }
            disabled={loading}
            className="w-full bg-zinc-800 text-white py-4 rounded-2xl font-semibold"
          >
            Załóż konto
          </button>
        </div>
      </div>
    </main>
  );
}