"use client";
import { useState } from "react";
import { categoryColors } from "@/lib/cockpit/data";

const categories = Object.keys(categoryColors);

export function ComposerForm() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("CELEBRITY");
  const [headline, setHeadline] = useState("AI headline will appear here");
  const [caption, setCaption] = useState("AI caption will appear here with Read more link");

  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
        <div className="space-y-3">
          <label className="text-sm text-gray-200">Source URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full rounded-md bg-black/40 border border-white/10 px-3 py-2 text-white"
          />
          <div className="flex flex-wrap gap-2 text-xs">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded border ${category === c ? "border-white text-white" : "border-white/10 text-gray-300"}`}
                style={category === c ? { background: categoryColors[c] } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-gray-200">AI Headline</label>
            <textarea
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full rounded-md bg-black/40 border border-white/10 px-3 py-2 text-white"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-gray-200">AI Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full rounded-md bg-black/40 border border-white/10 px-3 py-2 text-white"
              rows={4}
            />
          </div>
          <div className="flex gap-2 text-sm">
            <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md" type="button">Preview</button>
            <button className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-md" type="button">Post IG + FB</button>
            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-200 rounded-md" type="button">Save draft</button>
          </div>
        </div>
        <div className="bg-black/40 border border-white/10 rounded-xl p-3">
          <div className="text-sm text-gray-300 mb-2">Thumbnail preview</div>
          <div className="aspect-[4/5] w-full rounded-lg bg-gradient-to-b from-white/5 to-black/60 flex flex-col justify-end p-4 gap-2">
            <div className="flex items-center gap-2 text-xs font-black">
              <span className="bg-white/80 text-black px-2 py-1 rounded">PPP TV</span>
              <span className="px-2 py-1 rounded" style={{ background: categoryColors[category] || "#E50914", color: "#000" }}>
                {category}
              </span>
            </div>
            <div className="text-white font-bold text-2xl leading-tight line-clamp-3" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.45)" }}>
              {headline || "Your headline goes here"}
            </div>
            <div className="text-xs text-white/80">FOLLOW FOR MORE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
