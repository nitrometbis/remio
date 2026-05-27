"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

import { supabase } from "@/lib/supabase";

(pdfMake as any).vfs = (pdfFonts as any).vfs;

export default function Home() {
  const router = useRouter();

  const [pricing, setPricing] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [estimateData, setEstimateData] = useState<any>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});

  const {
    getRootProps: getAudioRootProps,
    getInputProps: getAudioInputProps,
    isDragActive: isAudioDragActive,
  } = useDropzone({
    accept: { "audio/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        setFile(acceptedFiles[0]);
      }
    },
  });

  const {
    getRootProps: getImageRootProps,
    getInputProps: getImageInputProps,
    isDragActive: isImageDragActive,
  } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        setImage(acceptedFiles[0]);
      }
    },
  });

  useEffect(() => {
    checkUser();
    loadPricing();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    loadHistory();
  }

  async function loadPricing() {
    try {
      const response = await fetch("/api/pricing");

      if (!response.ok) {
        console.error("Pricing API error");
        return;
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setPricing(data);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadHistory() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    const { data, error } = await supabase
      .from("estimates")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    if (data) {
      setHistory(data);
    }
  }

  async function handleUpload() {
    if (!file) return;

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append("file", file);

      if (image) {
        formData.append("image", image);
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      console.log("AI RESPONSE:", data);

      if (!response.ok) {
        console.error(data);
        alert(data.error || "Błąd transkrypcji");
        setLoading(false);
        return;
      }

      setTranscription(data.transcription || "");
      setFollowUpQuestions(data.followUpQuestions || []);

      let parsedEstimate;

      try {
        parsedEstimate =
          typeof data.estimate === "string"
            ? JSON.parse(data.estimate)
            : data.estimate;
      } catch (err) {
        console.error("JSON PARSE ERROR", err);
        alert("Błąd odczytu kosztorysu AI");
        setLoading(false);
        return;
      }

      setEstimateData(parsedEstimate);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { data: insertedData, error } = await supabase
          .from("estimates")
          .insert([
            {
              user_id: session.user.id,
              estimate: parsedEstimate,
              transcription: data.transcription,
            },
          ])
          .select();

        if (error) {
          console.error(error);
        }

        if (insertedData && insertedData.length > 0) {
          setHistory((prev) => [insertedData[0], ...prev]);
        }
      }
    } catch (error) {
      console.error(error);
      alert("Błąd uploadu");
    }

    setLoading(false);
  }

  async function handleFollowUp() {
    if (!estimateData) return;

    try {
      setLoading(true);

      const response = await fetch("/api/followup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estimate: estimateData,
          answers: followUpAnswers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(data);
        alert("Błąd aktualizacji kosztorysu");
        return;
      }

      setEstimateData((prev: any) => ({
        ...prev,
        tasks: data.tasks,
        summary: data.summary,
      }));

      alert("Kosztorys zaktualizowany");
    } catch (error) {
      console.error(error);
      alert("Błąd AI");
    } finally {
      setLoading(false);
    }
  }

  async function deleteEstimate(id: string) {
    const { error } = await supabase.from("estimates").delete().eq("id", id);

    if (error) {
      console.error(error);
      return;
    }

    setHistory((prev) => prev.filter((item) => item.id !== id));
  }

  async function generatePDF() {
    if (!estimateData) return;

    const logo = await fetch("/logo.png");
    const logoBlob = await logo.blob();

    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });

    const rows =
      estimateData.tasks?.map((task: any) => [
        task.name,
        `${task.labor} PLN`,
        `${task.materials} PLN`,
        `${task.total} PLN`,
      ]) || [];

    const docDefinition: any = {
      content: [
        {
          image: logoBase64,
          width: 120,
          margin: [0, 0, 0, 20],
        },
        {
          text: "REMIO AI",
          style: "header",
        },
        {
          text: "Profesjonalny kosztorys remontu łazienki",
          margin: [0, 0, 0, 20],
        },
        {
          text: `Metraż: ${estimateData.metraz} m²`,
        },
        {
          text: `Standard: ${estimateData.standard}`,
          margin: [0, 0, 0, 20],
        },
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: [["Zakres prac", "Robocizna", "Materiały", "Suma"], ...rows],
          },
        },
        {
          text: `SUMA: ${estimateData.summary?.total} PLN`,
          style: "total",
        },
      ],
      styles: {
        header: {
          fontSize: 28,
          bold: true,
        },
        total: {
          margin: [0, 20, 0, 0],
          fontSize: 20,
          bold: true,
        },
      },
    };

    pdfMake.createPdf(docDefinition).download("kosztorys-remio.pdf");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-5xl font-bold">Remio AI</h1>

            <p className="text-zinc-400 mt-2">
              Wrzuć głosówkę i wygeneruj wycenę łazienki.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-zinc-800 hover:bg-zinc-700 px-5 py-3 rounded-2xl"
          >
            Wyloguj
          </button>
        </div>

        <div className="mt-10 bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
          <div
            {...getImageRootProps()}
            className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition ${
              isImageDragActive
                ? "border-white bg-zinc-800"
                : "border-zinc-700 bg-zinc-900"
            }`}
          >
            <input {...getImageInputProps()} />

            <div className="flex flex-col items-center justify-center">
              <div className="text-5xl mb-4">🖼️</div>

              <p className="text-zinc-200 text-xl font-semibold">
                Dodaj zdjęcie łazienki
              </p>

              <p className="text-zinc-500 text-sm mt-2">JPG • PNG • WEBP</p>

              {image && (
                <div className="mt-6 bg-blue-500/10 border border-blue-500 text-blue-400 px-4 py-3 rounded-2xl">
                  Wybrano: {image.name}
                </div>
              )}
            </div>
          </div>

          <div
            {...getAudioRootProps()}
            className={`mt-4 border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition ${
              isAudioDragActive
                ? "border-white bg-zinc-800"
                : "border-zinc-700 bg-zinc-900"
            }`}
          >
            <input {...getAudioInputProps()} />

            <div className="flex flex-col items-center justify-center">
              <div className="text-5xl mb-4">🎤</div>

              <p className="text-zinc-200 text-xl font-semibold">
                Przeciągnij plik audio
              </p>

              <p className="text-zinc-500 text-sm mt-2">
                lub kliknij aby wybrać plik
              </p>

              <p className="text-zinc-600 text-xs mt-3">mp3 • wav • m4a</p>

              {file && (
                <div className="mt-6 bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded-2xl">
                  Wybrano: {file.name}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleUpload}
            disabled={loading}
            className="mt-6 w-full bg-white text-black py-4 rounded-2xl font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "AI analizuje..." : "Wyślij audio"}
          </button>

          {pricing.length > 0 && (
            <div className="mt-10">
              <h2 className="text-2xl font-bold mb-4">Cennik usług</h2>

              <div className="space-y-3">
                {pricing.map((item) => (
                  <div
                    key={item.name}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4"
                  >
                    <div className="font-semibold">{item.name}</div>

                    <div className="text-sm text-zinc-400 mt-2">
                      Basic: {item.basic} PLN
                    </div>

                    <div className="text-sm text-zinc-400">
                      Standard: {item.standard} PLN
                    </div>

                    <div className="text-sm text-zinc-400">
                      Premium: {item.premium} PLN
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {estimateData && (
            <div className="mt-10 bg-white p-6 rounded-2xl shadow-lg text-black">
              <h2 className="text-3xl font-bold mb-6">Kosztorys AI</h2>

              <div className="mb-6">
                <p className="text-lg">
                  <strong>Metraż:</strong> {estimateData.metraz} m²
                </p>

                <p className="text-lg mt-2">
                  <strong>Standard:</strong> {estimateData.standard}
                </p>
              </div>

              <div className="space-y-4">
                {estimateData.tasks?.map((task: any, index: number) => (
                  <div
                    key={index}
                    className="flex justify-between border-b pb-4 items-start"
                  >
                    <div>
                      <span className="font-medium">{task.name}</span>

                      <div className="mt-2 text-sm text-zinc-500">
                        <div>Robocizna: {task.labor} PLN</div>
                        <div>Materiały: {task.materials} PLN</div>
                      </div>
                    </div>

                    <input
                      type="number"
                      value={task.total || 0}
                      onChange={(e) => {
                        const updatedTasks = [...estimateData.tasks];

                        updatedTasks[index].total = Number(e.target.value);

                        const newTotal = updatedTasks.reduce(
                          (sum, t) => sum + t.total,
                          0
                        );

                        setEstimateData({
                          ...estimateData,
                          tasks: updatedTasks,
                          summary: {
                            ...estimateData.summary,
                            total: newTotal,
                          },
                        });
                      }}
                      className="border rounded-lg px-3 py-2 w-32 text-right"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-8 text-2xl font-bold flex justify-between">
                <span>Suma</span>

                <span>{estimateData.summary?.total?.toFixed(2)} PLN</span>
              </div>

              <button
                onClick={generatePDF}
                className="mt-8 w-full bg-black text-white py-4 rounded-2xl font-semibold"
              >
                Pobierz PDF
              </button>
            </div>
          )}

          {followUpQuestions.length > 0 && (
            <div className="mt-10 bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h2 className="text-2xl font-bold mb-6">Doprecyzuj remont</h2>

              <div className="space-y-5">
                {followUpQuestions.map((question, index) => (
                  <div key={index}>
                    <label className="block mb-2 text-zinc-300">
                      {question}
                    </label>

                    <input
                      type="text"
                      className="w-full bg-black border border-zinc-700 rounded-2xl px-4 py-3"
                      onChange={(e) =>
                        setFollowUpAnswers((prev) => ({
                          ...prev,
                          [question]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleFollowUp}
                disabled={loading}
                className="mt-8 w-full bg-white text-black py-4 rounded-2xl font-semibold disabled:opacity-50"
              >
                Zaktualizuj kosztorys AI
              </button>
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-10">
              <h2 className="text-2xl font-bold mb-4">Historia kosztorysów</h2>

              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl"
                  >
                    <button
                      onClick={() => setEstimateData(item.estimate)}
                      className="w-full text-left"
                    >
                      <div className="font-semibold">
                        {new Date(item.created_at).toLocaleString("pl-PL")}
                      </div>

                      <div className="text-zinc-400 text-sm mt-1">
                        {item?.estimate?.summary?.total || 0} PLN
                      </div>
                    </button>

                    <button
                      onClick={() => deleteEstimate(item.id)}
                      className="mt-3 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transcription && (
            <div className="mt-10 text-zinc-400 text-sm">
              <strong>Transkrypcja:</strong>

              <p className="mt-2">{transcription}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}