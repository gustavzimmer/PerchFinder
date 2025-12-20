import { For, Show } from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import { useParams } from "@solidjs/router";

const WaterCatchesComponent = () => {
  const params = useParams();
  const waterId = () => params.id;

  const catches = useGetCatches(waterId() ?? "");

  return (
    <section class="water-catches">
      <h2>Fångster</h2>

      <Show when={!catches.isLoading()} fallback={<div>Laddar fångster...</div>}>
        <Show when={catches.data() && catches.data()!.length > 0} fallback={<div>Inga fångster registrerade ännu.</div>}>
          <ul class="catch-list">
            <For each={catches.data()}>
              {(item) => (
                <li class="catch-card" data-id={item._id}>
                  <div class="catch-meta">

                    {item.photoUrl && (

                        <div class="catch-photo">
                            <img src={item.photoUrl} alt="Fångstbild" loading="lazy" />
                        </div>

                    )}

                    <div>
                      <strong>{item.weightG ? `${item.weightG} g` : "Okänd vikt"}</strong>{" "}
                      {item.lengthCm ? ` | ${item.lengthCm} cm` : null}
                    </div>

                    <div class="catch-time">
                      {new Date(item.caughtAt).toLocaleString("sv-SE")}
                    </div>

                    {item.notes && (
                        <div>
                            <h3>Kommentar</h3>
                            <p class="catch-notes">{item.notes}</p>
                        </div>
                    )}

                    <div>
                        <p> { item.weatherSummary } </p>
                        <p> { item.pressureHpa } </p>
                    </div>
                    
                  </div>

                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
};

export default WaterCatchesComponent;
