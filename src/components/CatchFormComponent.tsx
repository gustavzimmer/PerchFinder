import { Component, For, Show, Setter, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, catchCol, storage } from "../firebase";
import { CatchInput, LureOption } from "../types/Catch.types";
import { geoLocation } from "../types/Map.types";
import useGetLures from "../hooks/useGetLures";

interface CatchFormModalProps {
  waterId: string | undefined;
  waterLocation?: geoLocation | undefined;
  onClose: () => void;
  onStatus: Setter<string | null>;
  onError: Setter<string | null>;
}

const toUserName = (displayName: string | null | undefined, email: string | null | undefined) => {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  if (!email) return null;
  const [localPart] = email.split("@");
  return localPart || email;
};

const SOFT_PLASTIC_METHODS = [
  "Jigghuvud",
  "Carolina rig",
  "Texas rig",
  "NED rig",
  "Dropshot",
];

const isSoftPlasticLure = (lure: LureOption | null | undefined) => {
  if (!lure) return false;
  const type = lure.type.toLowerCase();
  return /jigg|shad|gummi|soft|swimbait/.test(type);
};

const CatchFormModal: Component<CatchFormModalProps> = (props) => {
  const [weight, setWeight] = createSignal("");
  const [length, setLength] = createSignal("");
  const nowLocalInput = () => new Date().toISOString().slice(0, 16);
  const [caughtAt, setCaughtAt] = createSignal(nowLocalInput());
  const [notes, setNotes] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);
  const [photoFiles, setPhotoFiles] = createSignal<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = createSignal<string[]>([]);
  const [isProcessingPhoto, setIsProcessingPhoto] = createSignal(false);
  const [selectedLureId, setSelectedLureId] = createSignal<string>("");
  const [selectedMethod, setSelectedMethod] = createSignal<string>("");
  const [lureQuery, setLureQuery] = createSignal("");
  const [formError, setFormError] = createSignal<string | null>(null);
  const luresData = useGetLures();

  const availableLures = createMemo(() => luresData.data() ?? []);
  const selectedLure = createMemo(
    () => availableLures().find((item) => item.id === selectedLureId()) ?? null
  );
  const shouldShowMethod = createMemo(() => isSoftPlasticLure(selectedLure()));

  /* Search for bait */
  const filteredLures = createMemo(() => {
    const q = lureQuery().toLowerCase().trim();
    if (!q) return availableLures();
    return availableLures().filter((lure) =>
      [lure.name, lure.brand, lure.type, lure.size, lure.color, lure.category ?? ""].some((field) =>
        field.toLowerCase().includes(q)
      )
    );
  });

  const resetForm = () => {
    setWeight("");
    setLength("");
    setNotes("");
    setCaughtAt(nowLocalInput());
    setSelectedMethod("");
    clearPhotos();
  };

  createEffect(() => {
    if (!shouldShowMethod()) {
      setSelectedMethod("");
    }
  });

  const clearPhotos = () => {
    photoPreviews().forEach((src) => URL.revokeObjectURL(src));
    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  onCleanup(() => {
    clearPhotos();
  });

  const parseNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed.replace(",", "."));
    return Number.isNaN(num) ? null : num;
  };

  const isHeicFile = (file: File) => {
    return (
      file.type.includes("heic") ||
      file.type.includes("heif") ||
      /\.heic$/i.test(file.name) ||
      /\.heif$/i.test(file.name)
    );
  };

  const normalizeHeicToJpeg = async (file: File) => {
    const isHeic =
      file.type.includes("heic") ||
      file.type.includes("heif") ||
      /\.heic$/i.test(file.name) ||
      /\.heif$/i.test(file.name);

    if (!isHeic) return file;

    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    const blob = Array.isArray(result) ? result[0] : result;
    const newName = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
    return new File([blob], `${newName}.jpg`, { type: "image/jpeg" });
  };

  const uploadPhoto = async (file: File, waterId: string) => {
    const ext = file.name.split(".").pop() || "jpg";
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const storageRef = ref(
      storage,
      `catch-photos/${waterId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`
    );
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  };

  const parseExifDateString = (value: string) => {
    const trimmed = value.trim();
    const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const formatDateTimeLocal = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  };

  const readExifDate = async (file: File) => {
    const isJpeg =
      file.type === "image/jpeg" ||
      /\.jpe?g$/i.test(file.name);
    if (!isJpeg) return null;

    try {
      const buffer = await file.arrayBuffer();
      const view = new DataView(buffer);
      if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

      let offset = 2;
      while (offset + 4 < view.byteLength) {
        const marker = view.getUint16(offset, false);
        const size = view.getUint16(offset + 2, false);
        if (marker === 0xffe1) {
          const exifHeaderOffset = offset + 4;
          if (exifHeaderOffset + 6 >= view.byteLength) return null;
          const exifHeader = String.fromCharCode(
            view.getUint8(exifHeaderOffset),
            view.getUint8(exifHeaderOffset + 1),
            view.getUint8(exifHeaderOffset + 2),
            view.getUint8(exifHeaderOffset + 3)
          );
          if (exifHeader !== "Exif") return null;

          const tiffOffset = exifHeaderOffset + 6;
          const endian = view.getUint16(tiffOffset, false);
          const littleEndian = endian === 0x4949;
          const readUint16 = (pos: number) => view.getUint16(pos, littleEndian);
          const readUint32 = (pos: number) => view.getUint32(pos, littleEndian);

          const firstIfdOffset = readUint32(tiffOffset + 4);
          if (firstIfdOffset === 0) return null;
          const ifd0Offset = tiffOffset + firstIfdOffset;
          const entries = readUint16(ifd0Offset);
          let exifIfdOffset: number | null = null;

          for (let i = 0; i < entries; i++) {
            const entryOffset = ifd0Offset + 2 + i * 12;
            const tag = readUint16(entryOffset);
            if (tag === 0x8769) {
              exifIfdOffset = tiffOffset + readUint32(entryOffset + 8);
              break;
            }
          }

          if (!exifIfdOffset) return null;

          const exifEntries = readUint16(exifIfdOffset);
          for (let i = 0; i < exifEntries; i++) {
            const entryOffset = exifIfdOffset + 2 + i * 12;
            const tag = readUint16(entryOffset);
            if (tag !== 0x9003 && tag !== 0x9004 && tag !== 0x0132) continue;
            const type = readUint16(entryOffset + 2);
            const count = readUint32(entryOffset + 4);
            if (type !== 2 || count === 0) continue;
            let valueOffset = entryOffset + 8;
            if (count > 4) {
              valueOffset = tiffOffset + readUint32(entryOffset + 8);
            }

            let value = "";
            for (let j = 0; j < count; j++) {
              const charCode = view.getUint8(valueOffset + j);
              if (charCode === 0) break;
              value += String.fromCharCode(charCode);
            }
            const parsed = parseExifDateString(value);
            if (parsed) return parsed;
          }
          return null;
        }

        if (size < 2) break;
        offset += 2 + size;
      }
    } catch (err) {
      console.warn("Kunde inte läsa EXIF-data", err);
    }

    return null;
  };

  const maybeSetCaughtAtFromExif = async (files: File[]) => {
    if (files.length === 0) return;
    for (const file of files) {
      const date = await readExifDate(file);
      if (date) {
        setCaughtAt(formatDateTimeLocal(date));
        return;
      }
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFormError(null);

    const currentFiles = photoFiles();
    const currentPreviews = photoPreviews();
    const remainingSlots = 2 - currentFiles.length;

    if (remainingSlots <= 0) {
      setFormError("Du kan max lägga till 2 bilder.");
      return;
    }

    const incoming = Array.from(files).slice(0, remainingSlots);
    const validIncoming = incoming.filter((file) => {
      const isImageType = file.type.startsWith("image/");
      const isHeicByExt = /\.heic$|\.heif$/i.test(file.name);
      return isImageType || isHeicByExt;
    });

    if (validIncoming.length !== incoming.length) {
      setFormError("Endast bildfiler tillåtna.");
    }

    if (validIncoming.length === 0) return;

    setIsProcessingPhoto(true);
    try {
      const normalizedFiles: File[] = [];
      for (const file of validIncoming) {
        const normalized = isHeicFile(file) ? await normalizeHeicToJpeg(file) : file;
        normalizedFiles.push(normalized);
      }
      const nextFiles = [...currentFiles, ...normalizedFiles].slice(0, 2);
      const nextPreviews = [
        ...currentPreviews,
        ...normalizedFiles.map((file) => URL.createObjectURL(file)),
      ].slice(0, 2);
      setPhotoFiles(nextFiles);
      setPhotoPreviews(nextPreviews);
      void maybeSetCaughtAtFromExif(normalizedFiles);
    } catch (err) {
      console.error("Kunde inte hantera bilden", err);
      setFormError("Kunde inte hantera bilden. Försök igen.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const removePhoto = (index: number) => {
    const currentFiles = photoFiles();
    const currentPreviews = photoPreviews();
    const targetPreview = currentPreviews[index];
    if (targetPreview) {
      URL.revokeObjectURL(targetPreview);
    }
    setPhotoFiles(currentFiles.filter((_, i) => i !== index));
    setPhotoPreviews(currentPreviews.filter((_, i) => i !== index));
  };

  const mapWeatherCode = (code: number | null | undefined) => {
    switch (code) {
      case 0:
        return "Klart";
      case 1:
      case 2:
        return "Mest klart";
      case 3:
        return "Molnigt";
      case 45:
      case 48:
        return "Dimmigt";
      case 51:
      case 53:
      case 55:
        return "Duggregn";
      case 56:
      case 57:
        return "Underkylt duggregn";
      case 61:
      case 63:
      case 65:
        return "Regn";
      case 66:
      case 67:
        return "Underkylt regn";
      case 71:
      case 73:
      case 75:
        return "Snöfall";
      case 77:
        return "Snökorn";
      case 80:
      case 81:
      case 82:
        return "Skurar";
      case 85:
      case 86:
        return "Snöbyar";
      case 95:
      case 96:
      case 99:
        return "Åska";
      default:
        return null;
    }
  };

  const fetchWeather = async (loc: geoLocation) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m,weather_code,surface_pressure&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather request failed");
    const json = await res.json();
    const current = json.current ?? json.current_weather;
    if (!current) {
      return {
        weatherCode: null,
        weatherSummary: null,
        temperatureC: null,
        pressureHpa: null,
      };
    }

    return {
      weatherCode:
        typeof current.weather_code === "number"
          ? current.weather_code
          : typeof current.weathercode === "number"
            ? current.weathercode
            : null,
      weatherSummary: mapWeatherCode(current.weather_code ?? current.weathercode),
      temperatureC:
        typeof current.temperature_2m === "number"
          ? current.temperature_2m
          : typeof current.temperature === "number"
            ? current.temperature
            : null,
      pressureHpa: typeof current.surface_pressure === "number" ? current.surface_pressure : null,
    };
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    props.onStatus(null);
    setFormError(null);

    const id = props.waterId;
    if (!id) {
      setFormError("Saknar vatten-id i URL:en.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setFormError("Du måste vara inloggad för att registrera en fångst.");
      return;
    }

    if (!weight().trim() && !length().trim()) {
      setFormError("Ange minst vikt eller längd för fångsten.");
      return;
    }

    const weightG = parseNumber(weight());
    const lengthCm = parseNumber(length());

    if (weight().trim() && weightG === null) {
      setFormError("Ogiltig vikt. Använd siffror, t.ex. 700");
      return;
    }
    if (length().trim() && lengthCm === null) {
      setFormError("Ogiltig längd. Använd siffror, t.ex. 35");
      return;
    }

    const caughtAtIso = caughtAt() ? new Date(caughtAt()).toISOString() : new Date().toISOString();

    const payload: CatchInput = {
      waterId: id,
      weightG,
      lengthCm,
      notes: notes().trim() || null,
      caughtAt: caughtAtIso,
      lure: null as LureOption | null,
      method: null,
      weatherCode: null,
      temperatureC: null,
      pressureHpa: null,
      userId: user.uid,
      userEmail: user.email ?? null,
      userName: toUserName(user.displayName, user.email),
    };

    try {
      setIsSaving(true);

      if (photoFiles().length > 0) {
        setIsProcessingPhoto(true);
        const urls: string[] = [];
        for (const file of photoFiles()) {
          const normalized = isHeicFile(file) ? await normalizeHeicToJpeg(file) : file;
          const url = await uploadPhoto(normalized, id);
          urls.push(url);
        }
        payload.photoUrls = urls;
        payload.photoUrl = urls[0] ?? null;
      }
      if (selectedLureId()) {
        const foundLure = selectedLure();
        if (foundLure) {
          payload.lure = foundLure;
          if (isSoftPlasticLure(foundLure) && selectedMethod().trim()) {
            payload.method = selectedMethod().trim();
          }
        }
      }
      if (props.waterLocation) {
        try {
          const weather = await fetchWeather(props.waterLocation);
          payload.weatherCode = weather.weatherCode;
          payload.weatherSummary = weather.weatherSummary;
          payload.temperatureC = weather.temperatureC;
          payload.pressureHpa = weather.pressureHpa;
        } catch (err) {
          console.warn("Kunde inte hämta väder", err);
        }
      }
      await addDoc(catchCol, {
        ...payload,
        createdAt: serverTimestamp(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("perchfinder:catch-saved", { detail: { waterId: id } })
        );
      }
      props.onStatus("Fångst sparad!");
      props.onClose();
      resetForm();
    } catch (err) {
      console.error("Kunde inte spara fångsten", err);
      setFormError("Det gick inte att spara fångsten just nu. Försök igen.");
    } finally {
      setIsProcessingPhoto(false);
      setIsSaving(false);
    }
  };

  return (
    <>
      <div class="catch-overlay" onClick={() => props.onClose()}>
        <div class="catch-modal" onClick={(e) => e.stopPropagation()}>
          <header class="catch-modal__header">
            <h2>Registrera fångst</h2>
            <button type="button" class="danger-button" onClick={() => props.onClose()}>
              Stäng
            </button>
          </header>
          <form class="catch-form" onSubmit={handleSubmit}>
            {formError() && <div class="form-status error">{formError()}</div>}
            <label>
              <span>Vikt (Gram)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="t.ex. 720"
                value={weight()}
                onInput={(e) => setWeight(e.currentTarget.value)}
              />
            </label>

            <label>
              <span>Längd (cm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="t.ex. 35"
                value={length()}
                onInput={(e) => setLength(e.currentTarget.value)}
              />
            </label>

            <label>
              <span>Tidpunkt</span>
              <input
                type="datetime-local"
                value={caughtAt()}
                onInput={(e) => setCaughtAt(e.currentTarget.value)}
              />
            </label>

            <label>
              <span>Beskrivning</span>
              <textarea
                rows={3}
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
                placeholder="Valfritt"
              />
            </label>

            <label class="lure-picker">
              <span>Betesval</span>
              <input
                type="search"
                placeholder="Sök namn, märke, färg..."
                value={lureQuery()}
                onInput={(e) => setLureQuery(e.currentTarget.value)}
              />
              <div class="lure-list" role="listbox" aria-label="Betesval">
                <button
                  type="button"
                  class={`lure-option ${selectedLureId() === "" ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedLureId("");
                    setSelectedMethod("");
                  }}
                  aria-selected={selectedLureId() === ""}
                >
                  Inget bete
                </button>
                <Show when={!luresData.isLoading()} fallback={<small>Laddar beten...</small>}>
                  <Show when={filteredLures().length > 0} fallback={<small>Inga beten med full info hittades.</small>}>
                    <For each={filteredLures()}>
                      {(lure) => {
                        const isSelected = () => selectedLureId() === lure.id;
                        return (
                          <button
                            type="button"
                            class={`lure-option ${isSelected() ? "is-selected" : ""}`}
                            onClick={() => setSelectedLureId(lure.id)}
                            aria-selected={isSelected()}
                          >
                            <strong>{lure.brand} {lure.name}</strong>
                            <small>
                              {lure.type} — {lure.size} — {lure.color}
                              {lure.category ? ` — ${lure.category}` : ""}
                            </small>
                          </button>
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </div>
            </label>

            <Show when={shouldShowMethod()}>
              <label>
                <span>Metod</span>
                <select
                  value={selectedMethod()}
                  onChange={(e) => setSelectedMethod(e.currentTarget.value)}
                >
                  <option value="">Välj metod (valfritt)</option>
                  <For each={SOFT_PLASTIC_METHODS}>
                    {(method) => <option value={method}>{method}</option>}
                  </For>
                </select>
              </label>
            </Show>

            <label>
              <span>Bild</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                onChange={(e) => {
                  void addPhotos(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <Show when={photoPreviews().length > 0}>
              <div class="photo-thumbs">
                <For each={photoPreviews()}>
                  {(src, index) => (
                    <div class="photo-thumb">
                      <img src={src} alt="Vald bild" />
                      <button
                        type="button"
                        class="photo-remove"
                        onClick={() => removePhoto(index())}
                        aria-label="Ta bort bild"
                      >
                        x
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="catch-form__actions">
              <button type="button" class="secondary-button" onClick={() => props.onClose()}>
                Avbryt
              </button>
              <button type="submit" class="primary-button" disabled={isSaving() || isProcessingPhoto()}>
                {isSaving() ? "Sparar..." : isProcessingPhoto() ? "Bearbetar bild..." : "Spara"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CatchFormModal;
