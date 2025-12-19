import { Component, Setter, createSignal } from "solid-js";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { catchCol, storage } from "../firebase";
import { CatchInput } from "../types/Catch.types";

interface CatchFormModalProps {
  waterId: string | undefined;
  onClose: () => void;
  onStatus: Setter<string | null>;
  onError: Setter<string | null>;
}

const CatchFormModal: Component<CatchFormModalProps> = (props) => {
  const [weight, setWeight] = createSignal("");
  const [length, setLength] = createSignal("");
  const nowLocalInput = () => new Date().toISOString().slice(0, 16);
  const [caughtAt, setCaughtAt] = createSignal(nowLocalInput());
  const [notes, setNotes] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);
  const [photoFile, setPhotoFile] = createSignal<File | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = createSignal(false);

  const resetForm = () => {
    setWeight("");
    setLength("");
    setNotes("");
    setCaughtAt(nowLocalInput());
    setPhotoFile(null);
  };

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

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    props.onStatus(null);
    props.onError(null);

    const id = props.waterId;
    if (!id) {
      props.onError("Saknar vatten-id i URL:en.");
      return;
    }

    const weightG = parseNumber(weight());
    const lengthCm = parseNumber(length());

    if (weight().trim() && weightG === null) {
      props.onError("Ogiltig vikt. Använd siffror, t.ex. 700");
      return;
    }
    if (length().trim() && lengthCm === null) {
      props.onError("Ogiltig längd. Använd siffror, t.ex. 35");
      return;
    }

    const caughtAtIso = caughtAt() ? new Date(caughtAt()).toISOString() : new Date().toISOString();

    const payload: CatchInput = {
      waterId: id,
      weightG,
      lengthCm,
      notes: notes().trim() || null,
      caughtAt: caughtAtIso,
      userId: null,
    };

    try {
      setIsSaving(true);
      if (photoFile()) {
        let file = photoFile();
        if (file) {
          if (isHeicFile(file)) {
            setIsProcessingPhoto(true);
            try {
              file = await normalizeHeicToJpeg(file);
            } catch (err) {
              console.error("Kunde inte konvertera HEIC", err);
              props.onError("Kunde inte hantera bilden. Försök igen eller använd JPG/PNG.");
              setIsSaving(false);
              setIsProcessingPhoto(false);
              return;
            } finally {
              setIsProcessingPhoto(false);
            }
          }
          payload.photoUrl = await uploadPhoto(file, id);
        }
      }
      await addDoc(catchCol, {
        ...payload,
        createdAt: serverTimestamp(),
      });
      props.onStatus("Fångst sparad!");
      props.onClose();
      resetForm();
    } catch (err) {
      console.error("Kunde inte spara fångsten", err);
      props.onError("Det gick inte att spara fångsten just nu. Försök igen.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div class="catch-overlay" onClick={() => props.onClose()}>
        <div class="catch-modal" onClick={(e) => e.stopPropagation()}>
          <header class="catch-modal__header">
            <h2>Registrera fångst</h2>
            <button type="button" class="link-button" onClick={() => props.onClose()}>
              Stäng
            </button>
          </header>
          <form class="catch-form" onSubmit={handleSubmit}>
            <label>
              <span>Vikt (Gram)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="t.ex. 1.2"
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

            <label>
              <span>Bild</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0] ?? null;
                  if (!file) {
                    setPhotoFile(null);
                    return;
                  }

                  const isImageType = file.type.startsWith("image/");
                  const isHeicByExt = /\.heic$|\.heif$/i.test(file.name);

                  if (!isImageType && !isHeicByExt) {
                    props.onError("Endast bildfiler tillåtna.");
                    e.currentTarget.value = "";
                    setPhotoFile(null);
                    return;
                  }

                  props.onError(null);
                  setPhotoFile(file);
                }}
              />
            </label>

            <div class="catch-form__actions">
              <button type="button" onClick={() => props.onClose()}>
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
