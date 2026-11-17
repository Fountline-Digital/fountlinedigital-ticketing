"use client";
import { useRef, useState, useTransition } from "react";
import { ArrowLeft, Columns2, ExternalLink, Heart, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { setFavorite, submitWebsite } from "../../../picker-actions";

type Offer = {
  offerId: string;
  designId: string;
  name: string;
  description: string | null;
  previewUrl: string | null;
  pages: string[];
  palettes: string[][];
  fonts: string[];
  images: string[];
  favorite: boolean;
};

const img = (fileId: string) => `/api/files/${fileId}?view=1`;

function Gallery({ offer }: { offer: Offer }) {
  const [i, setI] = useState(0);
  if (offer.images.length === 0) return <div className="flex aspect-[16/10] items-center justify-center bg-muted text-xs text-muted-foreground">Screenshot coming soon</div>;
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(offer.images[i])} alt={`${offer.name} screenshot ${i + 1}`} className="aspect-[16/10] w-full bg-muted object-cover object-top" />
      {offer.images.length > 1 && (
        <div className="flex gap-1 overflow-x-auto p-2" role="group" aria-label={`${offer.name} screenshots`}>
          {offer.images.map((f, j) => (
            <button key={f} type="button" onClick={() => setI(j)} aria-label={`Screenshot ${j + 1}`} aria-pressed={i === j} className={cn("shrink-0 overflow-hidden rounded border", i === j && "border-primary")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(f)} alt="" className="h-10 w-16 object-cover object-top" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {colors.map((c) => (
        <span key={c} className="size-5 rounded border" style={{ backgroundColor: c }} title={c} />
      ))}
    </span>
  );
}

export function Picker({
  projectId,
  offers: initialOffers,
  full,
  canSubmit,
  readOnly,
  initialDesignId,
}: {
  projectId: string;
  offers: Offer[];
  full: boolean;
  canSubmit: boolean;
  readOnly: boolean;
  initialDesignId: string | null;
}) {
  const [offers, setOffers] = useState(initialOffers);
  const [mode, setMode] = useState<"browse" | "compare" | "customize">("browse");
  const [designId, setDesignId] = useState<string | null>(initialDesignId);
  const [colors, setColors] = useState<string[]>([]);
  const [font, setFont] = useState("");
  const [note, setNote] = useState("");
  const [uploads, setUploads] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const favorites = offers.filter((o) => o.favorite);
  const chosen = offers.find((o) => o.designId === designId) ?? null;

  const toggleFav = (o: Offer) => {
    setOffers((s) => s.map((x) => (x.offerId === o.offerId ? { ...x, favorite: !x.favorite } : x)));
    void setFavorite(o.offerId, !o.favorite).then((r) => r.error && toast.error(r.error));
  };
  const choose = (o: Offer) => {
    setDesignId(o.designId);
    setColors(o.palettes[0] ?? []);
    setFont(o.fonts[0] ?? "");
    setMode("customize");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function addFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const id = await uploadFile({ projectId }, file);
        setUploads((s) => [...s, { id, name: file.name }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Couldn't upload ${file.name}.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  const DesignCard = ({ o, compact = false }: { o: Offer; compact?: boolean }) => (
    <Card className="overflow-hidden pt-0">
      <Gallery offer={o} />
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {o.name}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={o.favorite}
            aria-label={o.favorite ? `Remove ${o.name} from favorites` : `Add ${o.name} to favorites`}
            disabled={readOnly}
            onClick={() => toggleFav(o)}
          >
            <Heart className={o.favorite ? "fill-current text-primary" : ""} />
          </Button>
        </CardTitle>
        {o.description && !compact && <CardDescription>{o.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {o.pages.length > 0 && <p className="text-muted-foreground">Pages: {o.pages.join(", ")}</p>}
        {full && o.palettes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Color options</span>
            {o.palettes.map((p, i) => (
              <Swatches key={i} colors={p} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {o.previewUrl && (
            <a href={o.previewUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ExternalLink /> Live preview
            </a>
          )}
          <Button size="sm" disabled={readOnly} onClick={() => choose(o)}>
            Choose {o.name}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (mode === "customize" && chosen) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setMode("browse")}>
          <ArrowLeft /> Back to designs
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>You picked {chosen.name}</CardTitle>
            <CardDescription>{full ? "Choose colors and a font, add your files, then submit." : "Add your logo, photos and page content, then submit."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {full && (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Colors</legend>
                  {chosen.palettes.map((p, i) => (
                    <label key={i} className="flex items-center gap-3 text-sm">
                      <input type="radio" name="palette" checked={JSON.stringify(colors) === JSON.stringify(p)} onChange={() => setColors(p)} className="accent-primary" />
                      <Swatches colors={p} />
                      <span className="font-mono text-xs text-muted-foreground">{p.join(" ")}</span>
                    </label>
                  ))}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Or your own:</span>
                    {[0, 1, 2, 3].map((i) => (
                      <input
                        key={i}
                        type="color"
                        aria-label={`Custom color ${i + 1}`}
                        value={colors[i] ?? "#000000"}
                        onChange={(e) => setColors((s) => Object.assign([...s], { [i]: e.target.value }).filter(Boolean))}
                        className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                      />
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-1.5">
                  <Label htmlFor="font">Font</Label>
                  {chosen.fonts.length > 0 ? (
                    <select id="font" value={chosen.fonts.includes(font) ? font : "__other"} onChange={(e) => setFont(e.target.value === "__other" ? "" : e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {chosen.fonts.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                      <option value="__other">Something else…</option>
                    </select>
                  ) : null}
                  {(!chosen.fonts.length || !chosen.fonts.includes(font)) && (
                    <Input id={chosen.fonts.length ? "font-other" : "font"} aria-label="Font name" value={font} maxLength={60} placeholder="e.g. the font from your logo" onChange={(e) => setFont(e.target.value)} />
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Your logo, photos and page content</p>
              <Button type="button" variant="outline" size="sm" disabled={readOnly || uploading > 0} onClick={() => fileInput.current?.click()}>
                <Paperclip /> {uploading ? `Uploading ${uploading}…` : "Add files"}
              </Button>
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => void addFiles(e.currentTarget.files)} />
              {uploads.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${u.name}`} onClick={() => setUploads((s) => s.filter((x) => x.id !== u.id))}>
                    <X />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">You can also send files later from the project page.</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="note">Anything else we should know?</Label>
              <Textarea id="note" rows={4} value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} placeholder="Changes to the layout, sections you want, things you don't like…" />
            </div>

            {!canSubmit && <p className="text-sm text-muted-foreground">Only your company&apos;s approver can submit the final choice. Your favorites are saved for them.</p>}
            <div className="flex justify-end">
              <Button
                disabled={pending || readOnly || uploading > 0 || !canSubmit}
                onClick={() =>
                  confirm(`Submit ${chosen.name} as your website design? It locks in your choice.`) &&
                  start(async () => {
                    const r = await submitWebsite(projectId, { designId: chosen.designId, colors, font, note, fileIds: uploads.map((u) => u.id) });
                    if (r.error) toast.error(r.error);
                    else toast.success(r.ok);
                  })
                }
              >
                Submit my choice
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="View">
        <Button variant={mode === "browse" ? "default" : "outline"} size="sm" aria-pressed={mode === "browse"} onClick={() => setMode("browse")}>
          All designs ({offers.length})
        </Button>
        <Button variant={mode === "compare" ? "default" : "outline"} size="sm" aria-pressed={mode === "compare"} disabled={favorites.length < 2} onClick={() => setMode("compare")}>
          <Columns2 /> Compare favorites ({favorites.length})
        </Button>
      </div>
      {mode === "compare" ? (
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {favorites.map((o) => (
            <div key={o.offerId} className="w-[85vw] max-w-md shrink-0 snap-start">
              <DesignCard o={o} compact />
            </div>
          ))}
        </div>
      ) : (
        <>
          {favorites.length < 2 && <p className="text-sm text-muted-foreground">Tip: tap the heart on two or more designs to compare them side by side.</p>}
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {offers.map((o) => (
              <DesignCard key={o.offerId} o={o} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
