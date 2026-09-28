"use client";
import * as React from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "./ui";

type SR = { start(): void; stop(): void; lang: string; continuous: boolean; interimResults: boolean; onresult: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void; onend: () => void };

/** Free voice-to-text via the browser's Web Speech API (Chrome/Edge). */
export function VoiceButton({ onText, lang = "en-IN" }: { onText: (t: string) => void; lang?: string }) {
  const [on, setOn] = React.useState(false);
  const ref = React.useRef<SR | null>(null);
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => setSupported("webkitSpeechRecognition" in window || "SpeechRecognition" in window), []);
  if (!supported) return null;
  const toggle = () => {
    if (on) { ref.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const r = new (W.SpeechRecognition ?? W.webkitSpeechRecognition)!();
    r.lang = lang; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
    r.onend = () => setOn(false);
    ref.current = r; r.start(); setOn(true);
  };
  return (
    <Button type="button" variant={on ? "danger" : "outline"} size="sm" onClick={toggle} aria-label={on ? "Stop dictation" : "Dictate"}>
      {on ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}{on ? "Stop" : "Dictate"}
    </Button>
  );
}
