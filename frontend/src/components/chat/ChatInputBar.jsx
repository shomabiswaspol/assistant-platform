import { useRef, useState } from 'react';
import { Paperclip, Mic, Square, Send, Loader2 } from 'lucide-react';

export default function ChatInputBar({ onSend, onSendImage, onSendAudio, sending }) {
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // UI redesign (2026-08-09): cap raised 160px -> 200px per spec; textarea
  // itself scrolls internally once content exceeds that (overflow-y-auto in
  // the className below), so long multi-line drafts stay editable instead
  // of just clipping.
  const MAX_TEXTAREA_HEIGHT = 200;

  function autoResize(e) {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px';
  }

  function handleSend() {
    if (!input.trim() || sending) return;
    onSend(input);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleImagePick(e) {
    const file = e.target.files?.[0];
    if (file) onSendImage(file);
    e.target.value = '';
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        onSendAudio(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      alert('Microphone access denied or unavailable.');
    }
  }

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 shadow-md focus-within:ring-2 focus-within:ring-brand-500/50 transition-shadow">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || recording}
          className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-40"
          title="Attach an image"
          aria-label="Attach an image"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); autoResize(e); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={recording ? 'Recording…' : 'Ask anything...'}
          disabled={recording}
          rows={1}
          aria-label="Message"
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
          className="flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
        />
        {/* UI redesign (2026-08-09): dynamic mic<->send swap — mic is the
            default affordance for an empty composer; typing anything swaps
            it for Send instead of showing both permanently. Recording still
            takes over as Stop regardless of input text. */}
        {recording ? (
          <button
            type="button"
            onClick={toggleRecording}
            className="shrink-0 rounded-lg bg-red-500 p-2 text-white hover:bg-red-600"
            title="Stop recording"
            aria-label="Stop recording"
          >
            <Square size={16} />
          </button>
        ) : sending ? (
          // handleSend() clears `input` right away, so this must be checked
          // before the input.trim() branch below — otherwise the button
          // would flip straight to Mic mid-request and the loading spinner
          // would never actually show.
          <button
            type="button"
            disabled
            className="shrink-0 rounded-lg bg-brand-500 p-2 text-white opacity-70"
            title="Sending…"
            aria-label="Sending"
          >
            <Loader2 size={18} className="animate-spin" />
          </button>
        ) : input.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            className="shrink-0 rounded-lg bg-brand-500 p-2 text-white hover:bg-brand-600"
            title="Send"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleRecording}
            disabled={sending}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Record a voice message"
            aria-label="Record a voice message"
          >
            <Mic size={18} />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
        Voice notes are transcribed via Groq Whisper · images are analyzed via OmniRoute vision
      </p>
    </div>
  );
}
